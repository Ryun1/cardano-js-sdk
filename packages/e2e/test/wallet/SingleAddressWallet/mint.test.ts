/* eslint-disable sonarjs/no-duplicate-string */
import { Cardano, nativeScriptPolicyId } from '@cardano-sdk/core';
import { KeyRole, util } from '@cardano-sdk/key-management';
import { SingleAddressWallet } from '@cardano-sdk/wallet';
import { createLogger } from '@cardano-sdk/util-dev';
import { createStandaloneKeyAgent, submitAndConfirm, walletReady } from '../../util';
import { filter, firstValueFrom } from 'rxjs';
import { getEnv, getWallet, walletVariables } from '../../../src';

const env = getEnv(walletVariables);
const logger = createLogger();

describe('SingleAddressWallet/mint', () => {
  let wallet: SingleAddressWallet;

  afterAll(() => {
    wallet.shutdown();
  });

  it('can mint a token with no asset name', async () => {
    wallet = (await getWallet({ env, idx: 0, logger, name: 'Minting Wallet', polling: { interval: 50 } })).wallet;

    await walletReady(wallet);

    const genesis = await firstValueFrom(wallet.genesisParameters$);

    const aliceKeyAgent = await createStandaloneKeyAgent(
      util.generateMnemonicWords(),
      genesis,
      await wallet.keyAgent.getBip32Ed25519()
    );

    const derivationPath = {
      index: 0,
      role: KeyRole.External
    };

    const alicePubKey = await aliceKeyAgent.derivePublicKey(derivationPath);
    const aliceKeyHash = await aliceKeyAgent.bip32Ed25519.getPubKeyHash(alicePubKey);

    const alicePolicySigner = new util.KeyAgentTransactionSigner(aliceKeyAgent, derivationPath);

    const policyScript: Cardano.NativeScript = {
      __type: Cardano.ScriptType.Native,
      kind: Cardano.NativeScriptKind.RequireAllOf,
      scripts: [
        {
          __type: Cardano.ScriptType.Native,
          keyHash: aliceKeyHash,
          kind: Cardano.NativeScriptKind.RequireSignature
        }
      ]
    };

    const policyId = nativeScriptPolicyId(policyScript);
    const assetId = Cardano.AssetId(`${policyId}`); // skip asset name
    const tokens = new Map([[assetId, 1n]]);

    const walletAddress = (await firstValueFrom(wallet.addresses$))[0].address;

    const txProps = {
      extraSigners: [alicePolicySigner],
      mint: tokens,
      outputs: new Set([
        {
          address: walletAddress,
          value: {
            assets: tokens,
            coins: 3_000_000n
          }
        }
      ]),
      scripts: [policyScript]
    };

    const unsignedTx = await wallet.initializeTx(txProps);

    const finalizeProps = {
      extraSigners: [alicePolicySigner],
      scripts: [policyScript],
      tx: unsignedTx
    };

    await submitAndConfirm(wallet, await wallet.finalizeTx(finalizeProps));

    // Wait until wallet is aware of the minted token.
    const value = await firstValueFrom(
      wallet.balance.utxo.total$.pipe(filter(({ assets }) => (assets ? assets.has(assetId) : false)))
    );

    expect(value).toBeDefined();
    expect(value!.assets!.has(assetId)).toBeTruthy();
    expect(value!.assets!.get(assetId)).toBe(1n);
  });
});
