import * as Crypto from '@cardano-sdk/crypto';
import { Asset, Cardano, EpochInfo, EraSummary, NetworkInfoProvider, TxCBOR } from '@cardano-sdk/core';
import { BalanceTracker, DelegationTracker, TransactionsTracker, UtxoTracker } from './services';
import { Cip30DataSignature } from '@cardano-sdk/dapp-connector';
import { GroupedAddress, SignTransactionOptions, TransactionSigner, cip8 } from '@cardano-sdk/key-management';
import { Observable } from 'rxjs';
import { SelectionSkeleton } from '@cardano-sdk/input-selection';
import { Shutdown } from '@cardano-sdk/util';

export type InitializeTxProps = {
  outputs?: Set<Cardano.TxOut>;
  certificates?: Cardano.Certificate[];
  auxiliaryData?: Cardano.AuxiliaryData;
  options?: {
    validityInterval?: Cardano.ValidityInterval;
  };
  collaterals?: Set<Cardano.TxIn>;
  mint?: Cardano.TokenMap;
  scriptIntegrityHash?: Crypto.Hash32ByteBase16;
  requiredExtraSignatures?: Crypto.Ed25519KeyHashHex[];
  extraSigners?: TransactionSigner[];
  signingOptions?: SignTransactionOptions;
  scripts?: Cardano.Script[];
};

export interface FinalizeTxProps {
  tx: Cardano.TxBodyWithHash;
  auxiliaryData?: Cardano.AuxiliaryData;
  scripts?: Cardano.Script[];
  extraSigners?: TransactionSigner[];
  signingOptions?: SignTransactionOptions;
}

export type Assets = Map<Cardano.AssetId, Asset.AssetInfo>;

export interface OutputValidation {
  minimumCoin: Cardano.Lovelace;
  coinMissing: Cardano.Lovelace;
  tokenBundleSizeExceedsLimit: boolean;
}
export type MinimumCoinQuantityPerOutput = Map<Cardano.TxOut, OutputValidation>;

export interface InitializeTxPropsValidationResult {
  minimumCoinQuantities: MinimumCoinQuantityPerOutput;
}

export type InitializeTxResult = Cardano.TxBodyWithHash & { inputSelection: SelectionSkeleton };

export type SignDataProps = Omit<cip8.Cip30SignDataRequest, 'keyAgent'>;

export interface SyncStatus extends Shutdown {
  /**
   * Emits:
   * - `true` while waiting for any provider request to resolve
   * - `false` while there are no provider requests waiting to resolve
   */
  isAnyRequestPending$: Observable<boolean>;
  /**
   * Emits after wallet makes at least one request with each relevant provider method:
   * - `false` on load
   * - `true` when all provider requests resolve
   * - `false` when some provider request(s) do not resolve for some time (determined by specific wallet implementation)
   */
  isUpToDate$: Observable<boolean>;
  /**
   * Emits after wallet makes at least one request with each relevant provider method:
   * - `false` on load
   * - `true` while there are no provider requests waiting to resolve
   * - `false` while waiting for any provider request to resolve
   */
  isSettled$: Observable<boolean>;
}

export interface ObservableWallet {
  readonly balance: BalanceTracker;
  readonly delegation: DelegationTracker;
  readonly utxo: UtxoTracker;
  readonly transactions: TransactionsTracker;
  readonly tip$: Observable<Cardano.Tip>;
  readonly genesisParameters$: Observable<Cardano.CompactGenesis>;
  readonly eraSummaries$: Observable<EraSummary[]>;
  readonly currentEpoch$: Observable<EpochInfo>;
  readonly protocolParameters$: Observable<Cardano.ProtocolParameters>;
  readonly addresses$: Observable<GroupedAddress[]>;
  readonly assets$: Observable<Assets>;
  /**
   * This is the catch all Observable for fatal errors emitted by the Wallet.
   * Once errors are emitted, probably the only available recovery action is to
   * shutdown the Wallet and to create a new one.
   */
  readonly fatalError$: Observable<unknown>;
  readonly syncStatus: SyncStatus;

  getName(): Promise<string>;
  /**
   * @throws InputSelectionError
   */
  initializeTx(props: InitializeTxProps): Promise<InitializeTxResult>;
  finalizeTx(props: FinalizeTxProps): Promise<Cardano.Tx>;
  /**
   * @throws Cip30DataSignError
   */
  signData(props: SignDataProps): Promise<Cip30DataSignature>;
  /**
   * @throws CardanoNodeErrors.TxSubmissionError
   */
  submitTx(tx: Cardano.Tx | TxCBOR): Promise<Cardano.TransactionId>;

  shutdown(): void;
}

export type WalletNetworkInfoProvider = Pick<
  NetworkInfoProvider,
  'protocolParameters' | 'ledgerTip' | 'genesisParameters' | 'eraSummaries'
>;
