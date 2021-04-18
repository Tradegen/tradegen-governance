#!/usr/bin/env bash

ROOTDIR=$(pwd)/$(dirname $0)/..

mkdir tmp/
cd tmp/

curl https://raw.githubusercontent.com/Uniswap/governance/master/contracts/Timelock.sol > Timelock.sol
curl https://raw.githubusercontent.com/Uniswap/governance/master/contracts/Uni.sol > Uni.sol

cp Uni.sol VotingPower.sol
cp Uni.sol VotingToken.sol

GIST=$(gh gist create VotingPower.sol VotingToken.sol Timelock.sol -d "Uniswap/Ubeswap governance diff")

GIST_ID=$(echo "${GIST##*$'\n'}")

echo $GIST_ID

gh gist edit "$GIST_ID" --add $ROOTDIR/contracts/voting/VotingPower.sol
gh gist edit "$GIST_ID" --add $ROOTDIR/contracts/voting/VotingToken.sol
gh gist edit "$GIST_ID" --add $ROOTDIR/contracts/uniswap-governance/contracts/Timelock.sol

echo "Generated using a script at https://github.com/Ubeswap/ubeswap-governance/blob/master/scripts/generate-uni-diffs.sh" > "Diff between Ubeswap and Uniswap.md"
gh gist edit "$GIST_ID" --add "Diff between Ubeswap and Uniswap.md"

cd ..
rm -fr tmp/
