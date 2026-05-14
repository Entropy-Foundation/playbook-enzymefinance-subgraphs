import { Address, BigInt, Bytes, ethereum } from '@graphprotocol/graph-ts';
import { VaultTransaction } from '../generated/schema';

function vaultTransactionId(event: ethereum.Event): string {
  return event.transaction.hash.toHex() + '-' + event.logIndex.toString();
}

function newVaultTransaction(vaultId: string, type: string, event: ethereum.Event): VaultTransaction {
  let tx = new VaultTransaction(vaultTransactionId(event));
  tx.vault = vaultId;
  tx.type = type;
  tx.blockNumber = event.block.number;
  tx.timestamp = event.block.timestamp;
  tx.txHash = event.transaction.hash;
  return tx;
}

export function createVaultDepositTransaction(
  vaultId: string,
  user: Address,
  depositAsset: Address,
  depositAmount: BigInt,
  sharesMinted: BigInt,
  event: ethereum.Event,
): void {
  let tx = newVaultTransaction(vaultId, 'Deposit', event);
  tx.user = user as Bytes;
  tx.depositAsset = depositAsset as Bytes;
  tx.depositAmount = depositAmount;
  tx.sharesMinted = sharesMinted;
  tx.save();
}

export function createVaultWithdrawTransaction(
  vaultId: string,
  user: Address,
  redemptionAsset: Address | null,
  redemptionAmount: BigInt | null,
  sharesBurned: BigInt,
  event: ethereum.Event,
): void {
  let tx = newVaultTransaction(vaultId, 'Withdraw', event);
  tx.user = user as Bytes;
  if (redemptionAsset !== null) {
    tx.redemptionAsset = redemptionAsset as Bytes;
  }
  if (redemptionAmount !== null) {
    tx.redemptionAmount = redemptionAmount;
  }
  tx.sharesBurned = sharesBurned;
  tx.save();
}

export function createVaultSwapTransaction(
  vaultId: string,
  adapter: Address,
  fromAsset: Address,
  fromAmount: BigInt,
  toAsset: Address,
  toAmount: BigInt,
  event: ethereum.Event,
): void {
  let tx = newVaultTransaction(vaultId, 'Swap', event);
  tx.adapter = adapter as Bytes;
  tx.fromAsset = fromAsset as Bytes;
  tx.fromAmount = fromAmount;
  tx.toAsset = toAsset as Bytes;
  tx.toAmount = toAmount;
  tx.save();
}
