// SPDX-License-Identifier: MIT

pragma solidity >=0.8.3;

interface IWithFeeToSetter {
    function feeToSetter() external view returns (address);

    function setFeeToSetter(address) external;
}
