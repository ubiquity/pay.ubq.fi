export interface PermitRecordStrict {
  id: string;
  nonce: string;
  deadline: number;
  beneficiary: string;
  amount: string;
  token_address: string;
}
