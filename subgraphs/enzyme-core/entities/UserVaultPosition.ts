import { Address, BigInt, Bytes, ethereum, log } from '@graphprotocol/graph-ts';
import {
  GatedRedemptionQueueSharesWrapper,
  PendingRedemptionCancelled,
  RedemptionExecutedInTxMarker,
  UserVaultActivity,
  UserVaultPosition,
  Vault,
} from '../generated/schema';

export function userVaultPositionId(user: Address, wrapper: Address): string {
  return user.toHex() + '-' + wrapper.toHex();
}

export function ensureUserVaultPosition(user: Address, wrapper: Address, event: ethereum.Event): UserVaultPosition {
  let id = userVaultPositionId(user, wrapper);
  let position = UserVaultPosition.load(id);

  if (position == null) {
    let wrapperEntity = GatedRedemptionQueueSharesWrapper.load(wrapper.toHex());
    if (wrapperEntity == null) {
      log.critical('UserVaultPosition: missing GatedRedemptionQueueSharesWrapper {} for user {}', [
        wrapper.toHex(),
        user.toHex(),
      ]);
    }
    let vaultId = (wrapperEntity as GatedRedemptionQueueSharesWrapper).vault;

    position = new UserVaultPosition(id);
    position.user = user;
    position.wrapper = wrapper;
    position.vault = vaultId;
    position.firstSeenBlock = event.block.number;

    let vault = Vault.load(vaultId);
    if (vault != null) {
      vault.userDepositorCount = vault.userDepositorCount.plus(BigInt.fromI32(1));
      vault.save();
    }
  }

  position.lastUpdatedBlock = event.block.number;
  position.save();

  return position as UserVaultPosition;
}

function activityId(event: ethereum.Event, user: Address): string {
  return event.transaction.hash.toHex() + '-' + event.logIndex.toString() + '-' + user.toHex();
}

export class UserVaultActivityType {
  static readonly DEPOSIT: string = 'DEPOSIT';
  static readonly REDEMPTION_QUEUED: string = 'REDEMPTION_QUEUED';
  static readonly REDEMPTION_CANCELLED: string = 'REDEMPTION_CANCELLED';
  static readonly REDEMPTION_EXECUTED: string = 'REDEMPTION_EXECUTED';
}

export function appendUserVaultActivity(
  user: Address,
  wrapper: Address,
  type: string,
  event: ethereum.Event,
  shareAmount: BigInt | null,
  denomAssetAmount: BigInt | null,
  denomAsset: Address | null,
): UserVaultActivity {
  let position = ensureUserVaultPosition(user, wrapper, event);

  let activity = new UserVaultActivity(activityId(event, user));
  activity.position = position.id;
  activity.user = user;
  activity.wrapper = wrapper;
  activity.type = type;
  activity.txHash = event.transaction.hash;
  activity.blockNumber = event.block.number;
  activity.blockTimestamp = event.block.timestamp;

  if (shareAmount !== null) {
    activity.shareAmount = shareAmount as BigInt;
  }
  if (denomAssetAmount !== null) {
    activity.denomAssetAmount = denomAssetAmount as BigInt;
  }
  if (denomAsset !== null) {
    activity.denomAsset = denomAsset as Bytes;
  }

  activity.save();
  return activity;
}

// Disambiguates RedemptionRequestRemoved between a real cancellation
// (cancelRequestRedeem) and the queue cleanup that fires inside redeemFromQueue
// after Redeemed. Set this marker in handleRedeemed; check it in
// handleRedemptionRequestRemoved to suppress a spurious REDEMPTION_CANCELLED row.

function redemptionExecutedMarkerId(event: ethereum.Event, user: Address, wrapper: Address): string {
  return event.transaction.hash.toHex() + '-' + user.toHex() + '-' + wrapper.toHex();
}

export function markRedemptionExecutedInTx(event: ethereum.Event, user: Address, wrapper: Address): void {
  let id = redemptionExecutedMarkerId(event, user, wrapper);
  if (RedemptionExecutedInTxMarker.load(id) != null) {
    return;
  }
  let marker = new RedemptionExecutedInTxMarker(id);
  marker.save();
}

export function wasRedemptionExecutedInTx(event: ethereum.Event, user: Address, wrapper: Address): boolean {
  let id = redemptionExecutedMarkerId(event, user, wrapper);
  return RedemptionExecutedInTxMarker.load(id) != null;
}

// Covers the reverse ordering, where RedemptionRequestRemoved is processed
// before Redeemed in the same tx. handleRedemptionRequestRemoved records the
// id of the REDEMPTION_CANCELLED row it just wrote; handleRedeemed consumes it
// and deletes that row so only REDEMPTION_EXECUTED survives.

export function markRedemptionCancelledPending(
  event: ethereum.Event,
  user: Address,
  wrapper: Address,
  activityId: string,
): void {
  let id = redemptionExecutedMarkerId(event, user, wrapper);
  if (PendingRedemptionCancelled.load(id) != null) {
    return;
  }
  let pending = new PendingRedemptionCancelled(id);
  pending.activityId = activityId;
  pending.save();
}

export function consumeRedemptionCancelledPending(
  event: ethereum.Event,
  user: Address,
  wrapper: Address,
): string | null {
  let id = redemptionExecutedMarkerId(event, user, wrapper);
  let pending = PendingRedemptionCancelled.load(id);
  if (pending == null) {
    return null;
  }
  return pending.activityId;
}
