import { arrayDiff, arrayUnique, toBigDecimal, UINT256_MAX_BD, uniqueEventId } from '@enzymefinance/subgraph-utils';
import { BigInt } from '@graphprotocol/graph-ts';
import { ensureAccount } from '../entities/Account';
import { ensureAsset, isAsset } from '../entities/Asset';
import { ensureUniqueDepositor, ensureVaultDepositor } from '../entities/Depositor';
import { useVault } from '../entities/Vault';
import {
  ensureGatedRedemptionQueueSharesWrapper,
  ensureGatedRedemptionQueueSharesWrapperDepositApproval,
  ensureGatedRedemptionQueueSharesWrapperTransferApproval,
  ensureGatedRedemptionQueueSharesWrapperRedemptionApproval,
  ensureGatedRedemptionQueueSharesWrapperRedemptionRequest,
  ensureGatedRedemptionQueueSharesWrapperDepositorBalance,
  gatedRedemptionQueueSharesWrapperRedemptionRequestId,
  ensureGatedRedemptionQueueSharesWrapperDepositRequest,
  gatedRedemptionQueueSharesWrapperDepositorBalanceId,
} from '../entities/GatedRedemptionQueueSharesWrapper';
import {
  Approval,
  DepositApproval,
  Deposited,
  DepositModeSet,
  DepositRequestAdded,
  DepositRequestRemoved,
  Initialized,
  Kicked,
  ManagerAdded,
  ManagerRemoved,
  Redeemed,
  RedemptionApproval,
  RedemptionAssetSet,
  RedemptionRequestAdded,
  RedemptionRequestRemoved,
  RedemptionWindowConfigSet,
  Transfer,
  TransferApproval,
  TransferForced,
  UseDepositApprovalsSet,
  UseRedemptionApprovalsSet,
  UseTransferApprovalsSet,
} from '../generated/contracts/GatedRedemptionQueueSharesWrapperLibEvents';
import { store } from '@graphprotocol/graph-ts';
import { UINT256_MAX, ZERO_ADDRESS, ZERO_BD } from '../../../packages/utils/constants';
import {
  GatedRedemptionQueueSharesWrapperDeposit,
  GatedRedemptionQueueSharesWrapperKick,
  GatedRedemptionQueueSharesWrapperRedemption,
  GatedRedemptionQueueSharesWrapperRedemptionRequest,
  GatedRedemptionQueueSharesWrapperTransferIn,
  GatedRedemptionQueueSharesWrapperTransferInForced,
  GatedRedemptionQueueSharesWrapperTransferOut,
  GatedRedemptionQueueSharesWrapperTransferOutForced,
} from '../generated/schema';
import {
  UserVaultActivityType,
  appendUserVaultActivity,
  ensureUserVaultPosition,
  markRedemptionExecutedInTx,
  wasRedemptionExecutedInTx,
  markRedemptionCancelledPending,
  consumeRedemptionCancelledPending,
} from '../entities/UserVaultPosition';
import { createAssetAmount } from '../entities/AssetAmount';
import {
  createVaultDepositTransaction,
  createVaultWithdrawTransaction,
} from '../entities/VaultTransaction';

// Configuration

export function handleManagerAdded(event: ManagerAdded): void {
  let sharesWrapper = ensureGatedRedemptionQueueSharesWrapper(event.address);

  let account = ensureAccount(event.params.user, event);
  sharesWrapper.managers = arrayUnique<string>(sharesWrapper.managers.concat([account.id]));
  sharesWrapper.save();
}

export function handleManagerRemoved(event: ManagerRemoved): void {
  let sharesWrapper = ensureGatedRedemptionQueueSharesWrapper(event.address);

  let account = ensureAccount(event.params.user, event);
  sharesWrapper.managers = arrayDiff<string>(sharesWrapper.managers, [account.id]);
  sharesWrapper.save();
}

export function handleDepositModeSet(event: DepositModeSet): void {
  let sharesWrapper = ensureGatedRedemptionQueueSharesWrapper(event.address);
  sharesWrapper.depositMode = event.params.mode == 0 ? 'DIRECT' : 'REQUEST';
  sharesWrapper.save();
}

export function handleRedemptionWindowConfigSet(event: RedemptionWindowConfigSet): void {
  let sharesWrapper = ensureGatedRedemptionQueueSharesWrapper(event.address);
  sharesWrapper.firstWindowStart = event.params.firstWindowStart;
  sharesWrapper.duration = event.params.duration;
  sharesWrapper.frequency = event.params.frequency;
  sharesWrapper.relativeSharesCap = toBigDecimal(event.params.relativeSharesCap, 18);
  sharesWrapper.save();
}

export function handleRedemptionAssetSet(event: RedemptionAssetSet): void {
  let sharesWrapper = ensureGatedRedemptionQueueSharesWrapper(event.address);

  let asset = ensureAsset(event.params.asset);
  sharesWrapper.redemptionAsset = asset.id;
  sharesWrapper.save();
}

export function handleUseDepositApprovalsSet(event: UseDepositApprovalsSet): void {
  let sharesWrapper = ensureGatedRedemptionQueueSharesWrapper(event.address);
  sharesWrapper.useDepositApprovals = event.params.useApprovals;
  sharesWrapper.save();
}

export function handleUseRedemptionApprovalsSet(event: UseRedemptionApprovalsSet): void {
  let sharesWrapper = ensureGatedRedemptionQueueSharesWrapper(event.address);
  sharesWrapper.useRedemptionApprovals = event.params.useApprovals;
  sharesWrapper.save();
}

export function handleUseTransferApprovalsSet(event: UseTransferApprovalsSet): void {
  let sharesWrapper = ensureGatedRedemptionQueueSharesWrapper(event.address);
  sharesWrapper.useTransferApprovals = event.params.useApprovals;
  sharesWrapper.save();
}

// Deposit

export function handleDepositApproval(event: DepositApproval): void {
  if (!isAsset(event.params.asset)) {
    return;
  }

  let wrapper = ensureGatedRedemptionQueueSharesWrapper(event.address);
  let account = ensureAccount(event.params.user, event);
  let asset = ensureAsset(event.params.asset);
  let amount = toBigDecimal(event.params.amount, asset.decimals);

  let approval = ensureGatedRedemptionQueueSharesWrapperDepositApproval(wrapper, account, asset);
  if (amount.notEqual(ZERO_BD)) {
    approval.amount = amount;
    approval.timestamp = event.block.timestamp.toI32();
    approval.save();
  } else {
    store.remove('GatedRedemptionQueueSharesWrapperDepositApproval', approval.id);
  }
}

export function handleDepositRequestAdded(event: DepositRequestAdded): void {
  let wrapper = ensureGatedRedemptionQueueSharesWrapper(event.address);
  let account = ensureAccount(event.params.user, event);
  let asset = ensureAsset(event.params.depositAsset);

  let request = ensureGatedRedemptionQueueSharesWrapperDepositRequest(wrapper, account, asset);
  request.amount = request.amount.plus(toBigDecimal(event.params.depositAssetAmount, asset.decimals));
  request.timestamp = event.block.timestamp.toI32();
  request.save();

  // remove approval if needed
  if (wrapper.useDepositApprovals == true) {
    let approval = ensureGatedRedemptionQueueSharesWrapperDepositApproval(wrapper, account, asset);
    if (approval.amount.notEqual(toBigDecimal(UINT256_MAX, asset.decimals))) {
      store.remove('GatedRedemptionQueueSharesWrapperDepositApproval', approval.id);
    }
  }
}

export function handleDepositRequestRemoved(event: DepositRequestRemoved): void {
  let wrapper = ensureGatedRedemptionQueueSharesWrapper(event.address);
  let account = ensureAccount(event.params.user, event);
  let asset = ensureAsset(event.params.depositAsset);

  let request = ensureGatedRedemptionQueueSharesWrapperDepositRequest(wrapper, account, asset);
  store.remove('GatedRedemptionQueueSharesWrapperDepositRequest', request.id);
}

export function handleDeposited(event: Deposited): void {
  let wrapper = ensureGatedRedemptionQueueSharesWrapper(event.address);
  let account = ensureAccount(event.params.user, event);
  let asset = ensureAsset(event.params.depositToken);
  let sharesReceived = toBigDecimal(event.params.sharesReceived);
  let depositAmount = toBigDecimal(event.params.depositTokenAmount, asset.decimals);

  let deposit = new GatedRedemptionQueueSharesWrapperDeposit(uniqueEventId(event));
  deposit.timestamp = event.block.timestamp.toI32();
  deposit.vault = wrapper.vault;
  deposit.wrapper = wrapper.id;
  deposit.account = account.id;
  deposit.depositAssetAmount = createAssetAmount(
    asset,
    depositAmount,
    asset,
    'gated-redemption-queue-shares-wrapper-deposit',
    event,
  ).id;
  deposit.shares = sharesReceived;
  deposit.depositorBalance = gatedRedemptionQueueSharesWrapperDepositorBalanceId(wrapper, account);
  deposit.save();

  // Per-vault unique depositor aggregates for the discovery card.
  let vault = useVault(wrapper.vault);
  let depositor = ensureUniqueDepositor(event.params.user, event);
  let vaultDepositorWithFlag = ensureVaultDepositor(vault, depositor, event);
  let vaultDepositor = vaultDepositorWithFlag.entity;

  vaultDepositor.lastDepositAt = event.block.timestamp.toI32();
  vaultDepositor.totalDeposited = vaultDepositor.totalDeposited.plus(depositAmount);
  vaultDepositor.depositCount = vaultDepositor.depositCount + 1;
  vaultDepositor.save();

  depositor.lastDepositAt = event.block.timestamp.toI32();
  depositor.totalDepositedAcrossVaults = depositor.totalDepositedAcrossVaults.plus(depositAmount);
  depositor.save();

  if (vaultDepositorWithFlag.isFirstDeposit) {
    vault.depositorCount = vault.depositorCount.plus(BigInt.fromI32(1));
  }
  vault.totalDeposited = vault.totalDeposited.plus(depositAmount);
  vault.save();

  createVaultDepositTransaction(
    wrapper.vault,
    event.params.user,
    event.params.depositToken,
    event.params.depositTokenAmount,
    event.params.sharesReceived,
    event,
  );

  appendUserVaultActivity(
    event.params.user,
    event.address,
    UserVaultActivityType.DEPOSIT,
    event,
    event.params.sharesReceived,
    event.params.depositTokenAmount,
    event.params.depositToken,
  );

  // remove approval if needed
  if (wrapper.useDepositApprovals == true) {
    let approval = ensureGatedRedemptionQueueSharesWrapperDepositApproval(wrapper, account, asset);
    if (approval.amount.notEqual(toBigDecimal(UINT256_MAX, asset.decimals))) {
      store.remove('GatedRedemptionQueueSharesWrapperDepositApproval', approval.id);
    }
  }

  // remove deposit request if needed
}

// Transfer

export function handleTransferApproval(event: TransferApproval): void {
  let wrapper = ensureGatedRedemptionQueueSharesWrapper(event.address);
  let sender = ensureAccount(event.params.sender, event);
  let recipient = ensureAccount(event.params.recipient, event);
  let amount = toBigDecimal(event.params.amount);

  let approval = ensureGatedRedemptionQueueSharesWrapperTransferApproval(wrapper, sender, recipient);
  if (amount.notEqual(ZERO_BD)) {
    approval.amount = amount;
    approval.timestamp = event.block.timestamp.toI32();
    approval.save();
  } else {
    store.remove('GatedRedemptionQueueSharesWrapperTransferApproval', approval.id);
  }
}

export function handleTransfer(event: Transfer): void {
  let wrapper = ensureGatedRedemptionQueueSharesWrapper(event.address);
  let sender = ensureAccount(event.params.from, event);
  let recipient = ensureAccount(event.params.to, event);
  let sharesAmount = toBigDecimal(event.params.value);

  if (event.params.from.notEqual(ZERO_ADDRESS) && event.params.to.notEqual(ZERO_ADDRESS)) {
    let transferOut = new GatedRedemptionQueueSharesWrapperTransferOut(uniqueEventId(event, 'TransferOut'));
    transferOut.timestamp = event.block.timestamp.toI32();
    transferOut.vault = wrapper.vault;
    transferOut.wrapper = wrapper.id;
    transferOut.account = sender.id;
    transferOut.recipient = recipient.id;
    transferOut.shares = sharesAmount;
    transferOut.depositorBalance = gatedRedemptionQueueSharesWrapperDepositorBalanceId(wrapper, sender);
    transferOut.save();

    let transferIn = new GatedRedemptionQueueSharesWrapperTransferIn(uniqueEventId(event, 'TransferIn'));
    transferIn.timestamp = event.block.timestamp.toI32();
    transferIn.vault = wrapper.vault;
    transferIn.wrapper = wrapper.id;
    transferIn.sender = sender.id;
    transferIn.account = recipient.id;
    transferIn.shares = sharesAmount;
    transferIn.depositorBalance = gatedRedemptionQueueSharesWrapperDepositorBalanceId(wrapper, recipient);
    transferIn.save();
  }

  // remove approval if needed
  if (wrapper.useRedemptionApprovals == true) {
    let approval = ensureGatedRedemptionQueueSharesWrapperTransferApproval(wrapper, sender, recipient);
    if (approval.amount.notEqual(UINT256_MAX_BD)) {
      store.remove('GatedRedemptionQueueSharesWrapperTransferApproval', approval.id);
    }
  }

  if (event.params.from.notEqual(ZERO_ADDRESS)) {
    let senderBalance = ensureGatedRedemptionQueueSharesWrapperDepositorBalance(wrapper, sender, event);
    senderBalance.shares = senderBalance.shares.minus(sharesAmount);
    senderBalance.save();
  }

  if (event.params.to.notEqual(ZERO_ADDRESS)) {
    let recipientBalance = ensureGatedRedemptionQueueSharesWrapperDepositorBalance(wrapper, recipient, event);
    recipientBalance.shares = recipientBalance.shares.plus(sharesAmount);
    recipientBalance.save();
  }

  // Discovery: a Transfer surfaces the (user, wrapper) pair on the Portfolio page,
  // but does NOT produce a UserVaultActivity row — wrapper-share transfers are
  // intentionally excluded from the Activity Tab. Skip mint/burn legs (zero address)
  // since those are already covered by Deposited / Redeemed.
  if (event.params.from.notEqual(ZERO_ADDRESS)) {
    ensureUserVaultPosition(event.params.from, event.address, event);
  }
  if (event.params.to.notEqual(ZERO_ADDRESS)) {
    ensureUserVaultPosition(event.params.to, event.address, event);
  }
}

export function handleTransferForced(event: TransferForced): void {
  let wrapper = ensureGatedRedemptionQueueSharesWrapper(event.address);
  let sender = ensureAccount(event.params.sender, event);
  let recipient = ensureAccount(event.params.recipient, event);
  let sharesAmount = toBigDecimal(event.params.amount);

  let forcedOut = new GatedRedemptionQueueSharesWrapperTransferOutForced(uniqueEventId(event, 'TransferForcedOut'));
  forcedOut.timestamp = event.block.timestamp.toI32();
  forcedOut.vault = wrapper.vault;
  forcedOut.wrapper = wrapper.id;
  forcedOut.account = sender.id;
  forcedOut.recipient = recipient.id;
  forcedOut.shares = sharesAmount;
  forcedOut.depositorBalance = gatedRedemptionQueueSharesWrapperDepositorBalanceId(wrapper, sender);
  forcedOut.save();

  let forcedIn = new GatedRedemptionQueueSharesWrapperTransferInForced(uniqueEventId(event, 'TransferForcedIn'));
  forcedIn.timestamp = event.block.timestamp.toI32();
  forcedIn.vault = wrapper.vault;
  forcedIn.wrapper = wrapper.id;
  forcedIn.sender = sender.id;
  forcedIn.account = recipient.id;
  forcedIn.shares = sharesAmount;
  forcedIn.depositorBalance = gatedRedemptionQueueSharesWrapperDepositorBalanceId(wrapper, recipient);
  forcedIn.save();
}

// Redemption

export function handleRedemptionApproval(event: RedemptionApproval): void {
  let wrapper = ensureGatedRedemptionQueueSharesWrapper(event.address);
  let account = ensureAccount(event.params.user, event);
  let amount = toBigDecimal(event.params.amount);

  let approval = ensureGatedRedemptionQueueSharesWrapperRedemptionApproval(wrapper, account);
  if (amount.notEqual(ZERO_BD)) {
    approval.amount = amount;
    approval.timestamp = event.block.timestamp.toI32();
    approval.save();
  } else {
    store.remove('GatedRedemptionQueueSharesWrapperRedemptionApproval', approval.id);
  }
}

export function handleRedemptionRequestAdded(event: RedemptionRequestAdded): void {
  let wrapper = ensureGatedRedemptionQueueSharesWrapper(event.address);
  let account = ensureAccount(event.params.user, event);

  let request = ensureGatedRedemptionQueueSharesWrapperRedemptionRequest(wrapper, account);
  request.shares = request.shares.plus(toBigDecimal(event.params.sharesAmount));
  request.timestamp = event.block.timestamp.toI32();
  request.save();

  appendUserVaultActivity(
    event.params.user,
    event.address,
    UserVaultActivityType.REDEMPTION_QUEUED,
    event,
    event.params.sharesAmount,
    null,
    null,
  );

  // remove approval if needed
  if (wrapper.useRedemptionApprovals == true) {
    let approval = ensureGatedRedemptionQueueSharesWrapperRedemptionApproval(wrapper, account);
    if (approval.amount.notEqual(UINT256_MAX_BD)) {
      store.remove('GatedRedemptionQueueSharesWrapperRedemptionApproval', approval.id);
    }
  }
}

export function handleRedemptionRequestRemoved(event: RedemptionRequestRemoved): void {
  let wrapper = ensureGatedRedemptionQueueSharesWrapper(event.address);
  let account = ensureAccount(event.params.user, event);

  let request = ensureGatedRedemptionQueueSharesWrapperRedemptionRequest(wrapper, account);
  store.remove('GatedRedemptionQueueSharesWrapperRedemptionRequest', request.id);

  // RedemptionRequestRemoved fires in two cases:
  //   1. cancelRequestRedeem() → a real cancellation
  //   2. redeemFromQueue() → queue cleanup that follows a Redeemed event
  // Disambiguation must be order-independent (the two events can be emitted in
  // either log order within the tx):
  //   - Redeemed already processed → its marker is set, skip writing the row.
  //   - Redeemed not yet processed → write the row, but remember its id so the
  //     later Redeemed handler can delete it (markRedemptionCancelledPending).
  if (wasRedemptionExecutedInTx(event, event.params.user, event.address)) {
    return;
  }

  let activity = appendUserVaultActivity(
    event.params.user,
    event.address,
    UserVaultActivityType.REDEMPTION_CANCELLED,
    event,
    null,
    null,
    null,
  );
  markRedemptionCancelledPending(event, event.params.user, event.address, activity.id);
}

export function handleRedeemed(event: Redeemed): void {
  let wrapper = ensureGatedRedemptionQueueSharesWrapper(event.address);
  let account = ensureAccount(event.params.user, event);
  let sharesAmount = toBigDecimal(event.params.sharesAmount);

  let redemption = new GatedRedemptionQueueSharesWrapperRedemption(uniqueEventId(event));
  redemption.timestamp = event.block.timestamp.toI32();
  redemption.vault = wrapper.vault;
  redemption.wrapper = wrapper.id;
  redemption.account = account.id;
  redemption.shares = sharesAmount;
  redemption.payoutAssetAmounts = new Array<string>();
  redemption.depositorBalance = gatedRedemptionQueueSharesWrapperDepositorBalanceId(wrapper, account);
  redemption.save();

  createVaultWithdrawTransaction(
    wrapper.vault,
    event.params.user,
    event.params.redemptionAsset,
    event.params.redemptionAssetAmount,
    event.params.sharesAmount,
    event,
  );

  // Mark this tx as having had an execution so the paired RedemptionRequestRemoved
  // handler can skip emitting a REDEMPTION_CANCELLED activity row (Redeemed-first
  // ordering). For the reverse ordering, RedemptionRequestRemoved has already
  // written that row — delete it here so only REDEMPTION_EXECUTED survives.
  markRedemptionExecutedInTx(event, event.params.user, event.address);

  let pendingCancelledId = consumeRedemptionCancelledPending(event, event.params.user, event.address);
  if (pendingCancelledId !== null) {
    store.remove('UserVaultActivity', pendingCancelledId as string);
  }

  appendUserVaultActivity(
    event.params.user,
    event.address,
    UserVaultActivityType.REDEMPTION_EXECUTED,
    event,
    event.params.sharesAmount,
    event.params.redemptionAssetAmount,
    event.params.redemptionAsset,
  );

  // update request
  let requestId = gatedRedemptionQueueSharesWrapperRedemptionRequestId(wrapper, account);
  let request = GatedRedemptionQueueSharesWrapperRedemptionRequest.load(requestId);

  if (request == null) {
    return;
  }

  if (request.shares.minus(sharesAmount).equals(ZERO_BD)) {
    store.remove('GatedRedemptionQueueSharesWrapperRedemptionRequest', request.id);
  } else {
    request.shares.minus(sharesAmount);
    request.save();
  }
}

export function handleKicked(event: Kicked): void {
  let wrapper = ensureGatedRedemptionQueueSharesWrapper(event.address);
  let account = ensureAccount(event.params.user, event);
  let sharesAmount = toBigDecimal(event.params.sharesAmount);

  let kick = new GatedRedemptionQueueSharesWrapperKick(uniqueEventId(event));
  kick.timestamp = event.block.timestamp.toI32();
  kick.vault = wrapper.vault;
  kick.wrapper = wrapper.id;
  kick.account = account.id;
  kick.shares = sharesAmount;
  kick.payoutAssetAmounts = new Array<string>();
  kick.depositorBalance = gatedRedemptionQueueSharesWrapperDepositorBalanceId(wrapper, account);
  kick.save();
}

export function handleApproval(event: Approval): void {}

export function handleInitialized(event: Initialized): void {}
