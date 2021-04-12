import { parseEther } from "ethers/lib/utils";

/**
 * Initial operator address that controls all Timelocks.
 */
export const OPERATOR = "0x489AAc7Cb9A3B233e4a289Ec92284C8d83d49c6f";

const ONE_DAY_SECONDS = 24 * 60 * 60;
const ONE_YEAR_SECONDS = ONE_DAY_SECONDS * 365;

// ----------------------------------------------------------------
// Allocation (all numbers are in tokens)
// ----------------------------------------------------------------

// Released
const ALLOC_TEAM = 13000000;
const ALLOC_EARLY_SUPPORTERS = 12700000;
const ALLOC_RELEASED = ALLOC_TEAM + ALLOC_EARLY_SUPPORTERS;

// Liquid
const ALLOC_TREASURY = 2200000;

// ----------------------------------------------------------------
// Lockup schedule (3 year linear release)
// ----------------------------------------------------------------

export const LOCKUP_BEGIN_TS = 1619100000;
// GMT	Thu Apr 22 2021 14:00:00 GMT+0000
// Thu Apr 22 2021 09:00:00 GMT-0500 (Central Daylight Time)

export const LOCKUP_END_TS = LOCKUP_BEGIN_TS + ONE_YEAR_SECONDS * 3;

// ----------------------------------------------------------------
// Computed values
// ----------------------------------------------------------------

// Compute allocation
export const allocReleased = parseEther(ALLOC_RELEASED.toString());
export const allocLiquidityTreasury = parseEther(ALLOC_TREASURY.toString());

export const TWO_DAYS_SECONDS = 2 * ONE_DAY_SECONDS;
