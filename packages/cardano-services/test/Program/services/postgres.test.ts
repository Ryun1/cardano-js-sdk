/* eslint-disable sonarjs/no-identical-functions */
/* eslint-disable sonarjs/no-duplicate-string */
/* eslint-disable max-len */
import { DbSyncEpochPollService, EpochMonitor, loadGenesisData } from '../../../src/util';
import { DbSyncNetworkInfoProvider, NetworkInfoHttpService } from '../../../src/NetworkInfo';
import { HttpServer, HttpServerConfig, createDnsResolver, getPool } from '../../../src';
import { InMemoryCache, UNLIMITED_CACHE_TTL } from '../../../src/InMemoryCache';
import { LedgerTipModel, findLedgerTip } from '../../../src/util/DbSyncProvider';
import { OgmiosCardanoNode } from '@cardano-sdk/ogmios';
import { Pool } from 'pg';
import { SrvRecord } from 'dns';
import { getPort, getRandomPort } from 'get-port-please';
import { healthCheckResponseMock, mockCardanoNode } from '../../../../core/test/CardanoNode/mocks';
import { logger } from '@cardano-sdk/util-dev';
import { types } from 'util';
import axios from 'axios';

jest.mock('dns', () => ({
  promises: {
    resolveSrv: async (serviceName: string): Promise<SrvRecord[]> => {
      if (serviceName === process.env.POSTGRES_SRV_SERVICE_NAME)
        return [{ name: 'localhost', port: 5433, priority: 6, weight: 5 }];
      return [];
    }
  }
}));

describe('Service dependency abstractions', () => {
  const APPLICATION_JSON = 'application/json';
  const cache = new InMemoryCache(UNLIMITED_CACHE_TTL);
  const cardanoNodeConfigPath = process.env.CARDANO_NODE_CONFIG_PATH!;
  const dnsResolver = createDnsResolver({ factor: 1.1, maxRetryTime: 1000 }, logger);

  describe('Postgres-dependant service with service discovery', () => {
    let httpServer: HttpServer;
    let db: Pool | undefined;
    let port: number;
    let apiUrlBase: string;
    let config: HttpServerConfig;
    let service: NetworkInfoHttpService;
    let networkInfoProvider: DbSyncNetworkInfoProvider;
    let epochMonitor: EpochMonitor;
    let cardanoNode: OgmiosCardanoNode;
    let lastBlockNoInDb: LedgerTipModel;

    beforeAll(async () => {
      db = await getPool(dnsResolver, logger, {
        dbCacheTtl: 10_000,
        epochPollInterval: 1000,
        postgresDb: process.env.POSTGRES_DB!,
        postgresPassword: process.env.POSTGRES_PASSWORD!,
        postgresSrvServiceName: process.env.POSTGRES_SRV_SERVICE_NAME!,
        postgresUser: process.env.POSTGRES_USER!
      });
    });

    describe('Established connection', () => {
      beforeAll(async () => {
        port = await getPort();
        config = { listen: { port } };
        apiUrlBase = `http://localhost:${port}/network-info`;
        epochMonitor = new DbSyncEpochPollService(db!, 10_000);
        lastBlockNoInDb = (await db!.query<LedgerTipModel>(findLedgerTip)).rows[0];
        cardanoNode = mockCardanoNode(
          healthCheckResponseMock({
            blockNo: lastBlockNoInDb.block_no.valueOf(),
            hash: lastBlockNoInDb.hash.toString('hex'),
            projectedTip: {
              blockNo: lastBlockNoInDb.block_no.valueOf(),
              hash: lastBlockNoInDb.hash.toString('hex'),
              slot: Number(lastBlockNoInDb.slot_no)
            },
            slot: Number(lastBlockNoInDb.slot_no),
            withTip: true
          })
        ) as unknown as OgmiosCardanoNode;
        const genesisData = await loadGenesisData(cardanoNodeConfigPath);
        const deps = { cache, cardanoNode, db: db!, epochMonitor, genesisData, logger };

        networkInfoProvider = new DbSyncNetworkInfoProvider(deps);
        service = new NetworkInfoHttpService({ logger, networkInfoProvider });
        httpServer = new HttpServer(config, { logger, runnableDependencies: [cardanoNode], services: [service] });

        await httpServer.initialize();
        await httpServer.start();
      });

      afterAll(async () => {
        await db!.end();
        await httpServer.shutdown();
        await cache.shutdown();
        jest.clearAllTimers();
      });

      it('db should be a instance of Proxy ', () => {
        expect(types.isProxy(db!)).toEqual(true);
      });

      it('forwards the db health response', async () => {
        const res = await axios.post(`${apiUrlBase}/health`, {
          headers: { 'Content-Type': APPLICATION_JSON }
        });
        expect(res.status).toBe(200);
        expect(res.data).toEqual(
          healthCheckResponseMock({
            blockNo: lastBlockNoInDb.block_no.valueOf(),
            hash: lastBlockNoInDb.hash.toString('hex'),
            projectedTip: {
              blockNo: lastBlockNoInDb.block_no.valueOf(),
              hash: lastBlockNoInDb.hash.toString('hex'),
              slot: Number(lastBlockNoInDb.slot_no)
            },
            slot: Number(lastBlockNoInDb.slot_no),
            withTip: true
          })
        );
      });
    });
  });

  describe('Postgres-dependant service with static config', () => {
    let httpServer: HttpServer;
    let db: Pool | undefined;
    let port: number;
    let apiUrlBase: string;
    let config: HttpServerConfig;
    let service: NetworkInfoHttpService;
    let networkInfoProvider: DbSyncNetworkInfoProvider;
    let epochMonitor: EpochMonitor;
    let cardanoNode: OgmiosCardanoNode;
    let lastBlockNoInDb: LedgerTipModel;

    beforeAll(async () => {
      db = await getPool(dnsResolver, logger, {
        dbCacheTtl: 10_000,
        epochPollInterval: 1000,
        postgresConnectionString: process.env.POSTGRES_CONNECTION_STRING
      });
    });

    describe('Established connection', () => {
      beforeAll(async () => {
        port = await getPort();
        config = { listen: { port } };
        apiUrlBase = `http://localhost:${port}/network-info`;
        epochMonitor = new DbSyncEpochPollService(db!, 1000);
        lastBlockNoInDb = (await db!.query<LedgerTipModel>(findLedgerTip)).rows[0];
        cardanoNode = mockCardanoNode(
          healthCheckResponseMock({
            blockNo: lastBlockNoInDb.block_no.valueOf(),
            hash: lastBlockNoInDb.hash.toString('hex'),
            projectedTip: {
              blockNo: lastBlockNoInDb.block_no.valueOf(),
              hash: lastBlockNoInDb.hash.toString('hex'),
              slot: Number(lastBlockNoInDb.slot_no)
            },
            slot: Number(lastBlockNoInDb.slot_no),
            withTip: true
          })
        ) as unknown as OgmiosCardanoNode;
        const genesisData = await loadGenesisData(cardanoNodeConfigPath);
        const deps = { cache, cardanoNode, db: db!, epochMonitor, genesisData, logger };
        networkInfoProvider = new DbSyncNetworkInfoProvider(deps);
        service = new NetworkInfoHttpService({ logger, networkInfoProvider });
        httpServer = new HttpServer(config, { logger, runnableDependencies: [cardanoNode], services: [service] });

        await httpServer.initialize();
        await httpServer.start();
      });

      afterAll(async () => {
        await db!.end();
        await httpServer.shutdown();
        await cache.shutdown();
        jest.clearAllTimers();
      });

      it('db should not be instance a of Proxy ', () => {
        expect(types.isProxy(db!)).toEqual(false);
      });

      it('forwards the db health response', async () => {
        const res = await axios.post(`${apiUrlBase}/health`, {
          headers: { 'Content-Type': APPLICATION_JSON }
        });
        expect(res.status).toBe(200);
        expect(res.data).toEqual(
          healthCheckResponseMock({
            blockNo: lastBlockNoInDb.block_no.valueOf(),
            hash: lastBlockNoInDb.hash.toString('hex'),
            projectedTip: {
              blockNo: lastBlockNoInDb.block_no.valueOf(),
              hash: lastBlockNoInDb.hash.toString('hex'),
              slot: Number(lastBlockNoInDb.slot_no)
            },
            slot: Number(lastBlockNoInDb.slot_no),
            withTip: true
          })
        );
      });
    });
  });

  describe('Db pool provider with service discovery and Postgres server failover', () => {
    let provider: Pool | undefined;
    const pgPortDefault = 5433;

    it('should resolve successfully if a connection error is thrown and re-connects to a new resolved record', async () => {
      const HEALTH_CHECK_QUERY = 'SELECT 1';
      const srvRecord = { name: 'localhost', port: pgPortDefault, priority: 1, weight: 1 };
      const failingPostgresMockPort = await getRandomPort();
      let resolverAlreadyCalled = false;

      // Initially resolves with a failing postgres port, then swap to the default one
      const dnsResolverMock = jest.fn().mockImplementation(async () => {
        if (!resolverAlreadyCalled) {
          resolverAlreadyCalled = true;
          return { ...srvRecord, port: failingPostgresMockPort };
        }
        return srvRecord;
      });

      provider = await getPool(dnsResolverMock, logger, {
        dbCacheTtl: 10_000,
        epochPollInterval: 1000,
        postgresDb: process.env.POSTGRES_DB!,
        postgresPassword: process.env.POSTGRES_PASSWORD!,
        postgresSrvServiceName: process.env.POSTGRES_SRV_SERVICE_NAME!,
        postgresUser: process.env.POSTGRES_USER!
      });

      const result = await provider!.query(HEALTH_CHECK_QUERY);
      await expect(result.rowCount).toBeTruthy();
      expect(dnsResolverMock).toBeCalledTimes(2);
    });

    it('should execute a provider operation without to intercept it', async () => {
      provider = await getPool(dnsResolver, logger, {
        dbCacheTtl: 10_000,
        epochPollInterval: 1000,
        postgresDb: process.env.POSTGRES_DB!,
        postgresPassword: process.env.POSTGRES_PASSWORD!,
        postgresSrvServiceName: process.env.POSTGRES_SRV_SERVICE_NAME!,
        postgresUser: process.env.POSTGRES_USER!
      });

      await expect(provider!.end()).resolves.toBeUndefined();
    });
  });
});
