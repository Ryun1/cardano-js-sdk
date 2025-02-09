/* eslint-disable sonarjs/no-duplicate-string */
/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  EraSummariesResponse,
  HealthCheckResponse,
  InvocationState,
  StakeDistributionResponse,
  SystemStartResponse,
  TxSubmitResponse
} from './types';
import { HEALTH_RESPONSE_BODY } from './util';
import { Schema, UnknownResultError } from '@cardano-ogmios/client';
import { Server, createServer } from 'http';
import WebSocket from 'ws';

export interface MockOgmiosServerConfig {
  healthCheck?: {
    response: HealthCheckResponse;
  };
  submitTx?: {
    response: TxSubmitResponse | TxSubmitResponse[];
  };
  stateQuery?: {
    eraSummaries?: {
      response: EraSummariesResponse;
    };
    systemStart?: {
      response: SystemStartResponse;
    };
    stakeDistribution?: {
      response: StakeDistributionResponse;
    };
  };
  submitTxHook?: (data?: Uint8Array) => void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const handleSubmitTx = async (
  invocations: InvocationState,
  config: MockOgmiosServerConfig,
  args: any,
  send: (result: unknown) => void
) => {
  const { submitTx, submitTxHook } = config;
  if (!submitTx) throw new Error('Missing submitTx in mock config');

  let { response } = submitTx;
  if (!Array.isArray(response)) response = [response];

  let result: Schema.SubmitSuccess | Schema.SubmitFail;

  if (invocations.txSubmit >= response.length) {
    invocations.txSubmit = response.length - 1;
  }

  if (response[invocations.txSubmit].success) {
    result = { SubmitSuccess: { txId: '###' } };
    ++invocations.txSubmit;
  } else if (response[invocations.txSubmit].failWith?.type === 'eraMismatch') {
    ++invocations.txSubmit;
    result = { SubmitFail: [{ eraMismatch: { ledgerEra: 'Shelley', queryEra: 'Alonzo' } }] };
  } else if (response[invocations.txSubmit].failWith?.type === 'beforeValidityInterval') {
    result = {
      SubmitFail: [
        { outsideOfValidityInterval: { currentSlot: 23, interval: { invalidBefore: 42, invalidHereafter: null } } }
      ]
    };
    ++invocations.txSubmit;
  } else {
    throw new Error('Unknown mock response');
  }
  if (submitTxHook) await submitTxHook(Uint8Array.from(Buffer.from(args.submit, 'hex')));
  send(result);
};

const handleQuery = async (query: string, config: MockOgmiosServerConfig, send: (result: unknown) => void) => {
  let result:
    | Schema.EraSummary[]
    | Date
    | 'QueryUnavailableInCurrentEra'
    | Schema.PoolDistribution
    | UnknownResultError;
  switch (query) {
    case 'eraSummaries':
      if (config.stateQuery?.eraSummaries?.response.success) {
        result = [
          {
            end: { epoch: 74, slot: 1_598_400, time: 31_968_000 },
            parameters: { epochLength: 21_600, safeZone: 4320, slotLength: 20 },
            start: { epoch: 0, slot: 0, time: 0 }
          },
          {
            end: { epoch: 102, slot: 13_694_400, time: 44_064_000 },
            parameters: { epochLength: 432_000, safeZone: 129_600, slotLength: 1 },
            start: { epoch: 74, slot: 1_598_400, time: 31_968_000 }
          }
        ];
      } else if (config.stateQuery?.eraSummaries?.response.failWith?.type === 'unknownResultError') {
        result = new UnknownResultError('');
      } else if (config.stateQuery?.eraSummaries?.response.failWith?.type === 'connectionError') {
        result = new UnknownResultError({ code: 'ECONNREFUSED' });
      } else {
        throw new Error('Unknown mock response');
      }
      break;
    case 'systemStart':
      if (config.stateQuery?.systemStart?.response.success) {
        result = new Date(1_506_203_091_000);
      } else if (config.stateQuery?.systemStart?.response.failWith?.type === 'queryUnavailableInEra') {
        result = 'QueryUnavailableInCurrentEra';
      } else {
        throw new Error('Unknown mock response');
      }
      break;
    case 'stakeDistribution':
      if (config.stateQuery?.stakeDistribution?.response.success) {
        result = {
          pool1la4ghj4w4f8p4yk4qmx0qvqmzv6592ee9rs0vgla5w6lc2nc8w5: {
            stake: '10098109508/40453712883332027',
            vrf: '4e4a2e82dc455449bf5f1f6d249470963cf97389b5dc4d2118fe21625f50f518'
          },
          pool1lad5j5kawu60qljfqh02vnazxrahtaaj6cpaz4xeluw5xf023cg: {
            stake: '14255969766/40453712883332027',
            vrf: '474a6d2a44b51add62d8f2fd8fe80abc722bf84478479b617ad05b39aaa84971'
          },
          pool1llugtz5r4t6m7xz6es4qu7cszllm5y3uvx3ast5a9jzlv7h3xdu: {
            stake: '98763124501826/40453712883332027',
            vrf: 'dc1c0fd7d2fd95b6e9bf0e50ab5cb722edbd7d6e85b7d53323884d429ec6a83c'
          },
          pool1lu6ll4rcxm92059ggy6uym2p804s5hcwqyyn5vyqhy35kuxtn2f: {
            stake: '1494933206/40453712883332027',
            vrf: '4a13d5e99a1868788057bf401fdb4379b7846290dd948918839981088059a564'
          }
        };
      } else if (config.stateQuery?.stakeDistribution?.response.failWith?.type === 'queryUnavailableInEra') {
        result = 'QueryUnavailableInCurrentEra';
      } else {
        throw new Error('Unknown mock response');
      }
      break;
    default:
      throw new Error('Query not mocked');
  }
  send(result);
};

export const createMockOgmiosServer = (config: MockOgmiosServerConfig): Server => {
  const invocations: InvocationState = {
    txSubmit: 0
  };

  const server = createServer((req, res) => {
    if (config.healthCheck?.response.success === false) {
      res.statusCode = 500;
      return res.end('{"error":"INTERNAL_SERVER_ERROR"}');
    }
    res.setHeader('Content-Type', 'application/json');

    if (req.method !== 'GET' || req.url !== '/health') {
      res.statusCode = 405;
      res.end('{"error":"METHOD_NOT_ALLOWED"}');
      return;
    }

    res.end(
      JSON.stringify({
        ...HEALTH_RESPONSE_BODY,
        lastKnownTip: config.healthCheck?.response.blockNo
          ? { ...HEALTH_RESPONSE_BODY.lastKnownTip, blockNo: config.healthCheck.response.blockNo }
          : HEALTH_RESPONSE_BODY.lastKnownTip,
        networkSynchronization:
          config.healthCheck?.response.networkSynchronization ?? HEALTH_RESPONSE_BODY.networkSynchronization
      })
    );
  });
  const wss = new WebSocket.Server({
    server
  });
  wss.on('connection', (ws) => {
    ws.on('message', async (data) => {
      const { args, methodname, mirror } = JSON.parse(data as string);
      const send = (result: unknown) =>
        ws.send(
          JSON.stringify({
            methodname,
            reflection: mirror,
            result,
            servicename: 'ogmios',
            type: 'jsonwsp/response',
            version: '1.0'
          })
        );
      switch (methodname) {
        case 'SubmitTx':
          await handleSubmitTx(invocations, config, args, send);
          break;
        case 'Query':
          await handleQuery(args.query, config, send);
          break;
        default:
          throw new Error('Method not mocked');
      }
    });
  });
  return server;
};

export const listenPromise = (server: Server, port: number, hostname?: string): Promise<Server> =>
  new Promise((resolve, reject) => {
    server.listen(port, hostname, () => resolve(server));
    server.on('error', reject);
  });

export const serverClosePromise = (server: Server): Promise<void> =>
  new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
