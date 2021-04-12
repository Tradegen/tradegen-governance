// SPDX-License-Identifier: MIT

pragma solidity ^0.8.3;

import "../openzeppelin-solidity/contracts/Math.sol";
import "../openzeppelin-solidity/contracts/SafeMath.sol";
import "../openzeppelin-solidity/contracts/Ownable.sol";
import "../openzeppelin-solidity/contracts/SafeERC20.sol";
import "../openzeppelin-solidity/contracts/ReentrancyGuard.sol";

import "./VotingToken.sol";
import "../interfaces/IReleaseToken.sol";

/**
 * Voting, non-transferrable token with a linear release schedule.
 */
contract LinearReleaseToken is
    VotingToken,
    Ownable,
    IReleaseToken,
    ReentrancyGuard
{
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    /// @notice Timestamp of when the release starts.
    uint256 public immutable startTime;

    /// @notice Timestamp of when the cliff ends.
    uint256 public immutable cliffEndTime;

    /// @notice Timestamp of when the release ends.
    uint256 public immutable endTime;

    /// @notice Token to release
    IERC20 public immutable token;

    /// @notice Unallocated share
    uint96 public unallocated;

    /// @notice The total number of tokens ever allocated to each address.
    mapping(address => uint96) public lifetimeTotalAllocated;

    /// @notice The total number of tokens each address ever claimed.
    mapping(address => uint96) public totalClaimed;

    /**
     * @notice Creates a LinearReleaseToken. Transfer `amount_` tokens to this contract after it's deployed.
     *
     * @param name_ Name of the ERC20 token
     * @param symbol_ Symbol of the ERC20 token
     * @param decimals_ Decimals of the ERC20 token
     * @param owner_ who can send tokens to others
     * @param token_ the token that is released
     * @param amount_ amount of tokens to lock up (max 96 bits, i.e. 2 billion tokens with 18 decimals)
     * @param startTime_ when release starts
     * @param cliffEndTime_ when the cliff starts. If set to 0, this does not take effect.
     * @param endTime_ when release ends
     */
    constructor(
        string memory name_,
        string memory symbol_,
        uint8 decimals_,
        address owner_,
        address token_,
        uint96 amount_,
        uint256 startTime_,
        uint256 cliffEndTime_,
        uint256 endTime_
    ) VotingToken(name_, symbol_, decimals_) {
        transferOwnership(owner_);
        token = IERC20(token_);
        unallocated = amount_;
        startTime = startTime_;
        cliffEndTime = cliffEndTime_;
        endTime = endTime_;
    }

    /**
     * Allocates release tokens to the specified holders.
     * @param _holders Array of holders of release tokens
     * @param _amounts Array of amounts of tokens to issue
     */
    function allocate(address[] calldata _holders, uint96[] calldata _amounts)
        external
        override
        onlyOwner
    {
        require(
            _holders.length == _amounts.length,
            "LinearReleaseToken: length mismatch"
        );
        require(
            _holders.length <= 20,
            "LinearReleaseToken: max 20 holders at initial allocation"
        );
        for (uint8 i = 0; i < _holders.length; i++) {
            _allocate(_holders[i], _amounts[i]);
        }
    }

    function _allocate(address _holder, uint96 _amount) internal {
        unallocated = sub96(
            unallocated,
            _amount,
            "LinearReleaseToken::_allocate: overallocated"
        );
        lifetimeTotalAllocated[_holder] = add96(
            lifetimeTotalAllocated[_holder],
            _amount,
            "LinearReleaseToken::_allocate: total allocation overflow"
        );

        _mintVotes(_holder, _amount);
        emit Allocated(_holder, _amount);
    }

    /**
     * Computes the number of tokens that the address can redeem.
     */
    function earned(address _owner) public view override returns (uint96) {
        // compute the total amount of tokens earned if this holder never claimed
        uint96 earnedIfNeverClaimed =
            releasableSupplyOfPrincipal(lifetimeTotalAllocated[_owner]);
        if (earnedIfNeverClaimed == 0) {
            return 0;
        }

        // subtract the total already claimed by the address
        return
            sub96(
                earnedIfNeverClaimed,
                totalClaimed[_owner],
                "LinearReleaseToken: earned invalid"
            );
    }

    /**
     * The total amount of UBE tokens that can be redeemed if all
     * tokens were distributed.
     */
    function releasableSupply() public view returns (uint96) {
        return
            releasableSupplyOfPrincipal(
                add96(
                    totalVotingPower(),
                    unallocated,
                    "LinearReleaseToken::releasableSupply: overflow"
                )
            );
    }

    /**
     * Computes the releasable supply of the given principal amount.
     */
    function releasableSupplyOfPrincipal(uint256 _principal)
        public
        view
        returns (uint96)
    {
        // solhint-disable-next-line not-rely-on-time
        if (block.timestamp < startTime || block.timestamp < cliffEndTime) {
            return 0;
        }
        uint256 secondsSinceStart =
            // solhint-disable-next-line not-rely-on-time
            Math.min(block.timestamp, endTime).sub(startTime);
        return
            safe96(
                uint256(_principal).mul(secondsSinceStart).div(
                    endTime.sub(startTime)
                ),
                "LinearReleaseToken::circulatingSupply: invalid amount"
            );
    }

    /**
     * Claims any tokens that the sender is entitled to.
     */
    function claim() public override nonReentrant {
        uint96 amount = earned(msg.sender);
        if (amount == 0) {
            // don't do anything if the sender has no tokens.
            return;
        }

        totalClaimed[msg.sender] = add96(
            totalClaimed[msg.sender],
            amount,
            "LinearReleaseToken::claim: total claimed overflow"
        );
        _burnVotes(msg.sender, amount);
        token.safeTransfer(msg.sender, amount);
        emit Claimed(msg.sender, amount);
    }
}
