import { useVault } from '../entities/Vault';
import {
  CrossChainMessageReceived,
  ExecutionRevertedEvent,
  QueueStateQueriedEvent,
  RedemptionQueueProcessedEvent,
} from '../generated/schema';
import {
  ExecutionReverted,
  FundCreationInitiated,
  MessageReceived,
  QueueStateQueried,
  RedemptionQueueProcessed,
} from '../generated/contracts/InstructionInboxEvents';

export function handleFundCreationInitiated(event: FundCreationInitiated): void {
  let vault = useVault(event.params.vaultAddress.toHex());
  vault.strategyId = event.params.strategyId;
  vault.fundCreator = event.transaction.from;
  vault.save();
}

// Inbound cross-chain message on Ethereum. `messageId` pairs back to the Supra
// MessagePostedEvent (messageIdA) so the backend poller can attach the Eth leg.
export function handleMessageReceived(event: MessageReceived): void {
  let id = event.transaction.hash.toHex() + '-' + event.logIndex.toString();
  let entity = new CrossChainMessageReceived(id);
  entity.messageId = event.params.messageId;
  entity.srcChainId = event.params.srcChainId_;
  entity.caller = event.params.caller;
  entity.toChainId = event.params.toChainId;
  entity.blockNumber = event.block.number;
  entity.timestamp = event.block.timestamp;
  entity.txHash = event.transaction.hash;
  entity.save();
}

// Redemption batch processed on Ethereum (same tx as the MessageReceived). The
// poller joins it to the message by txHash for the batch-range confirmation.
export function handleRedemptionQueueProcessed(event: RedemptionQueueProcessed): void {
  let id = event.transaction.hash.toHex() + '-' + event.logIndex.toString();
  let entity = new RedemptionQueueProcessedEvent(id);
  entity.vault = event.params.vaultAddress;
  entity.wrapper = event.params.wrapper;
  entity.startIndex = event.params.startIndex;
  entity.endIndex = event.params.endIndex;
  entity.blockNumber = event.block.number;
  entity.timestamp = event.block.timestamp;
  entity.txHash = event.transaction.hash;
  entity.save();
}

// Settle reverted on Ethereum (swap revert path). `reason` is raw revert
// return-data; the backend decodes it to a friendly message.
export function handleExecutionReverted(event: ExecutionReverted): void {
  let id = event.transaction.hash.toHex() + '-' + event.logIndex.toString();
  let entity = new ExecutionRevertedEvent(id);
  entity.vault = event.params.vaultAddress;
  entity.srcSender = event.params.srcSender;
  entity.messageType = event.params.messageType;
  entity.actionId = event.params.actionId;
  entity.reason = event.params.reason;
  entity.blockNumber = event.block.number;
  entity.timestamp = event.block.timestamp;
  entity.txHash = event.transaction.hash;
  entity.save();
}

// Queue state read on Ethereum (queue, step 2). Joined by txHash.
export function handleQueueStateQueried(event: QueueStateQueried): void {
  let id = event.transaction.hash.toHex() + '-' + event.logIndex.toString();
  let entity = new QueueStateQueriedEvent(id);
  entity.vault = event.params.vaultAddress;
  entity.queueLength = event.params.queueLength;
  entity.totalDenominationAssetNeeded = event.params.totalDenominationAssetNeeded;
  entity.blockNumber = event.block.number;
  entity.timestamp = event.block.timestamp;
  entity.txHash = event.transaction.hash;
  entity.save();
}
