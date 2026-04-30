import { useVault } from '../entities/Vault';
import { FundCreationInitiated } from '../generated/contracts/InstructionInboxEvents';

export function handleFundCreationInitiated(event: FundCreationInitiated): void {
  let vault = useVault(event.params.vaultAddress.toHex());
  vault.strategyId = event.params.strategyId;
  vault.fundCreator = event.transaction.from;
  vault.save();
}
