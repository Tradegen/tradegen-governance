// SPDX-License-Identifier: MIT

pragma solidity ^0.8.3;

import "./voting/LinearReleaseToken.sol";

/**
 * Released TGEN token.
 */
contract ReleaseTGEN is LinearReleaseToken {
    constructor(
        address owner_,
        address tgen_,
        uint96 amount_,
        uint256 startTime_,
        uint256 cliffEndTime_,
        uint256 endTime_
    )
        LinearReleaseToken(
            "Release TGEN",
            "rTGEN",
            18,
            owner_,
            tgen_,
            amount_,
            startTime_,
            cliffEndTime_,
            endTime_
        )
    // solhint-disable-next-line no-empty-blocks
    {
        // Do nothing
    }
}
