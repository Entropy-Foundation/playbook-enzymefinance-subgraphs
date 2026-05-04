import { Address, ethereum } from '@graphprotocol/graph-ts';
import { ZERO_BD } from '@enzymefinance/subgraph-utils';
import { Depositor, Vault, VaultDepositor } from '../generated/schema';

export function ensureUniqueDepositor(address: Address, event: ethereum.Event): Depositor {
  let id = address.toHex();
  let depositor = Depositor.load(id);

  if (depositor != null) {
    return depositor;
  }

  depositor = new Depositor(id);
  depositor.firstDepositAt = event.block.timestamp.toI32();
  depositor.lastDepositAt = event.block.timestamp.toI32();
  depositor.totalDepositedAcrossVaults = ZERO_BD;
  depositor.save();

  return depositor;
}

export function vaultDepositorId(vault: Vault, depositor: Depositor): string {
  return vault.id + '/' + depositor.id;
}

export class VaultDepositorWithFlag {
  constructor(public entity: VaultDepositor, public isFirstDeposit: boolean) {}
}

export function ensureVaultDepositor(
  vault: Vault,
  depositor: Depositor,
  event: ethereum.Event,
): VaultDepositorWithFlag {
  let id = vaultDepositorId(vault, depositor);
  let vaultDepositor = VaultDepositor.load(id);

  if (vaultDepositor != null) {
    return new VaultDepositorWithFlag(vaultDepositor, false);
  }

  vaultDepositor = new VaultDepositor(id);
  vaultDepositor.vault = vault.id;
  vaultDepositor.depositor = depositor.id;
  vaultDepositor.firstDepositAt = event.block.timestamp.toI32();
  vaultDepositor.lastDepositAt = event.block.timestamp.toI32();
  vaultDepositor.totalDeposited = ZERO_BD;
  vaultDepositor.depositCount = 0;

  return new VaultDepositorWithFlag(vaultDepositor, true);
}
