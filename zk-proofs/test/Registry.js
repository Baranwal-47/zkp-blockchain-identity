const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("CredentialRegistry Gas Costs", function () {
  let registry;

  before(async function () {
    const Registry = await ethers.getContractFactory("CredentialRegistry");
    registry = await Registry.deploy();
    await registry.waitForDeployment();
  });

  it("Should report gas cost for issuing a new credential", async function () {
    const tx = await registry.issueCredential(
      "22BCS001",
      "QmTp2h3d9rA4D3E5F6G7H8J9K0L1M2N3O4P5Q6R7S8T9U",
      "0x1234567890123456789012345678901234567890123456789012345678901234"
    );
    const receipt = await tx.wait();
    console.log(`
Gas used for issueCredential (new): ${receipt.gasUsed.toString()}`);
    expect(receipt.gasUsed).to.be.gt(0);
  });

  it("Should report gas cost for updating an existing credential", async function () {
    const tx = await registry.issueCredential(
      "22BCS001",
      "QmNewCidHashForAnExistingStudentCredentialValue",
      "0x9876543210987654321098765432109876543210987654321098765432109876"
    );
    const receipt = await tx.wait();
    console.log(`Gas used for issueCredential (update): ${receipt.gasUsed.toString()}`);
    expect(receipt.gasUsed).to.be.gt(0);
  });

  it("Should report gas cost for revoking a credential", async function () {
    // First, issue a credential to revoke
    await registry.issueCredential(
      "22BCS002",
      "QmAnotherCidHashForRevocationPurposeValue",
      "0xABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF1234567890"
    );

    const tx = await registry.revokeCredential("22BCS002");
    const receipt = await tx.wait();
    console.log(`Gas used for revokeCredential: ${receipt.gasUsed.toString()}`);
    expect(receipt.gasUsed).to.be.gt(0);
  });
});

describe("Admin transfer", function () {
  let registry;
  let deployer, newAdmin, stranger;

  beforeEach(async function () {
    [deployer, newAdmin, stranger] = await ethers.getSigners();
    const Registry = await ethers.getContractFactory("CredentialRegistry");
    registry = await Registry.deploy();
    await registry.waitForDeployment();
  });

  it("Should set deployer as admin after deploy", async function () {
    expect(await registry.admin()).to.equal(deployer.address);
  });

  it("Should let the admin start a transfer, setting pendingAdmin without changing admin", async function () {
    const tx = await registry.connect(deployer).transferAdmin(newAdmin.address);
    const receipt = await tx.wait();
    console.log(`Gas used for transferAdmin: ${receipt.gasUsed.toString()}`);

    expect(await registry.pendingAdmin()).to.equal(newAdmin.address);
    expect(await registry.admin()).to.equal(deployer.address);
  });

  it("Should revert when a non-admin calls transferAdmin", async function () {
    await expect(
      registry.connect(stranger).transferAdmin(newAdmin.address)
    ).to.be.revertedWith("Not authorized");
  });

  it("Should revert when an account that is not pendingAdmin calls acceptAdmin", async function () {
    await registry.connect(deployer).transferAdmin(newAdmin.address);

    await expect(
      registry.connect(stranger).acceptAdmin()
    ).to.be.revertedWith("Not pending admin");
  });

  it("Should let pendingAdmin accept, flipping admin and zeroing pendingAdmin", async function () {
    await registry.connect(deployer).transferAdmin(newAdmin.address);

    const tx = await registry.connect(newAdmin).acceptAdmin();
    const receipt = await tx.wait();
    console.log(`Gas used for acceptAdmin: ${receipt.gasUsed.toString()}`);

    expect(await registry.admin()).to.equal(newAdmin.address);
    expect(await registry.pendingAdmin()).to.equal(ethers.ZeroAddress);
  });

  it("Should revert old admin's issueCredential after handoff and allow the new admin", async function () {
    await registry.connect(deployer).transferAdmin(newAdmin.address);
    await registry.connect(newAdmin).acceptAdmin();

    await expect(
      registry.connect(deployer).issueCredential(
        "22BCS003",
        "QmOldAdminShouldNotBeAbleToIssueAfterHandoff",
        "0x1111111111111111111111111111111111111111111111111111111111111111"
      )
    ).to.be.revertedWith("Not authorized");

    await expect(
      registry.connect(newAdmin).issueCredential(
        "22BCS003",
        "QmNewAdminCanIssueAfterHandoff",
        "0x2222222222222222222222222222222222222222222222222222222222222222"
      )
    ).to.not.be.reverted;
  });
});
