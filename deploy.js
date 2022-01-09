const { ethers } = require("hardhat");

const TWO_DAY_SECONDS = 24 * 60 * 60 * 2;

async function deployTimelockContract() {
  const signers = await ethers.getSigners();
  deployer = signers[0];
  
  let TimelockFactory = await ethers.getContractFactory('Timelock');
  
  let timelock = await TimelockFactory.deploy(deployer.address, TWO_DAY_SECONDS);
  await timelock.deployed();
  let timelockAddress = timelock.address;
  console.log("Timelock: " + timelockAddress);
}

deployTimelockContract()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })