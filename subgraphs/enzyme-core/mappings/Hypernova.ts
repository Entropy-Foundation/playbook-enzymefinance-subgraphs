import { HypernovaMessagePosted } from '../generated/schema';
import { MessagePosted } from '../generated/contracts/HypernovaEvents';

// Outbound Eth→Supra message. Its `messageId` is messageIdB — the backend joins
// it by txHash to the settle (swap) / handle (queue) tx and writes it onto the
// operation so the Supra reply leg can pair to it.
export function handleMessagePosted(event: MessagePosted): void {
  let id = event.transaction.hash.toHex() + '-' + event.logIndex.toString();
  let entity = new HypernovaMessagePosted(id);
  entity.caller = event.params.caller;
  entity.messageId = event.params.messageId;
  entity.toChainId = event.params.toChainId;
  entity.blockNumber = event.block.number;
  entity.timestamp = event.block.timestamp;
  entity.txHash = event.transaction.hash;
  entity.save();
}
