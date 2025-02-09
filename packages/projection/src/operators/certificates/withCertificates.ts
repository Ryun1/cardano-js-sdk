import { Cardano } from '@cardano-sdk/core';
import { WithBlock } from '../../types';
import { unifiedProjectorOperator } from '../utils';

export interface CertificatePointer {
  slot: Cardano.Slot;
  txIndex: number;
  certIndex: number;
}

export interface OnChainCertificate {
  pointer: CertificatePointer;
  certificate: Cardano.Certificate;
}

export interface WithCertificates {
  /**
   * Order of certificates on rolled back transactions is reversed.
   */
  certificates: OnChainCertificate[];
}

const blockCertificates = ({
  block: {
    header: { slot },
    body
  }
}: WithBlock) =>
  body.flatMap(({ body: { certificates = [] } }, txIndex) =>
    certificates.map((certificate, certIndex) => ({
      certificate,
      pointer: {
        certIndex,
        slot,
        txIndex
      }
    }))
  );

/**
 * Map ChainSyncEvents to a flat array of certificates.
 */
export const withCertificates = unifiedProjectorOperator<{}, WithCertificates>((evt) => ({
  ...evt,
  certificates: blockCertificates(evt)
}));
