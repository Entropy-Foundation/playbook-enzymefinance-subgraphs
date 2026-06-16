import { useVault } from '../entities/Vault';
import { createVaultExecutionRevertedTransaction } from '../entities/VaultTransaction';
import { ExecutionRevertedNotified } from '../generated/contracts/BridgeManagerEvents';

export function handleExecutionRevertedNotified(event: ExecutionRevertedNotified): void {
  let vault = useVault(event.params.vaultProxy.toHex());
  createVaultExecutionRevertedTransaction(vault.id, event.params.sender, event.params.chainId, event);
}
