// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract CredentialRegistry {
    address public admin;
    address public pendingAdmin;

    struct Credential {
        string  rollNo;
        string  ipfsCID;
        bytes32 pubHash;
        uint256 issuedAt;
        bool    exists;
        bool    revoked;
    }

    mapping(string  => Credential) private credentialsByRollNo;
    mapping(bytes32 => string)     public  rollNoByHash;
    mapping(bytes32 => bool)       public  isValidHash;

    event CredentialIssued(string indexed rollNo, string ipfsCID, bytes32 pubHash, uint256 timestamp);
    event CredentialRevoked(string indexed rollNo, bytes32 pubHash, uint256 timestamp);
    event AdminTransferStarted(address indexed previousAdmin, address indexed newAdmin);
    event AdminTransferred(address indexed previousAdmin, address indexed newAdmin);

    modifier onlyAdmin() {
        require(msg.sender == admin, "Not authorized");
        _;
    }

    constructor() {
        admin = msg.sender;
    }

    function transferAdmin(address newAdmin) external onlyAdmin {
        pendingAdmin = newAdmin;
        emit AdminTransferStarted(admin, newAdmin);
    }

    function acceptAdmin() external {
        require(msg.sender == pendingAdmin, "Not pending admin");
        emit AdminTransferred(admin, pendingAdmin);
        admin = pendingAdmin;
        pendingAdmin = address(0);
    }

    function issueCredential(
        string  calldata rollNo,
        string  calldata ipfsCID,
        bytes32          pubHash
    ) external onlyAdmin {
        // If re-issuing (student update), invalidate the old hash
        Credential storage existing = credentialsByRollNo[rollNo];
        if (existing.exists && existing.pubHash != bytes32(0)) {
            isValidHash[existing.pubHash] = false;
            delete rollNoByHash[existing.pubHash];
        }

        credentialsByRollNo[rollNo] = Credential(rollNo, ipfsCID, pubHash, block.timestamp, true, false);
        rollNoByHash[pubHash]       = rollNo;
        isValidHash[pubHash]        = true;

        emit CredentialIssued(rollNo, ipfsCID, pubHash, block.timestamp);
    }

    function revokeCredential(string calldata rollNo) external onlyAdmin {
        Credential storage cred = credentialsByRollNo[rollNo];
        require(cred.exists,   "Credential not found");
        require(!cred.revoked, "Already revoked");

        cred.revoked              = true;
        isValidHash[cred.pubHash] = false;

        emit CredentialRevoked(rollNo, cred.pubHash, block.timestamp);
    }

    function getCredential(string calldata rollNo)
        external view
        returns (
            string  memory ipfsCID,
            bytes32        pubHash,
            uint256        issuedAt,
            bool           exists,
            bool           revoked
        )
    {
        Credential memory c = credentialsByRollNo[rollNo];
        return (c.ipfsCID, c.pubHash, c.issuedAt, c.exists, c.revoked);
    }

    function getCredentialByHash(bytes32 pubHash)
        external view
        returns (
            string  memory rollNo,
            string  memory ipfsCID,
            uint256        issuedAt,
            bool           exists,
            bool           revoked
        )
    {
        string memory rNo = rollNoByHash[pubHash];
        Credential memory c = credentialsByRollNo[rNo];
        return (rNo, c.ipfsCID, c.issuedAt, c.exists, c.revoked);
    }
}
