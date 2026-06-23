// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract CredentialRegistry {
    address public admin;
    address public pendingAdmin;
    // Direct issuer (acad-admin backend EOA). Issuance is a routine direct write;
    // only revocation/governance goes through `admin` (the Gnosis Safe 2-of-3).
    address public issuer;

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
    event CredentialUpdated(string indexed rollNo, string newCID, bytes32 newPubHash, uint256 timestamp);
    event AdminTransferStarted(address indexed previousAdmin, address indexed newAdmin);
    event AdminTransferred(address indexed previousAdmin, address indexed newAdmin);
    event IssuerChanged(address indexed previousIssuer, address indexed newIssuer);

    modifier onlyAdmin() {
        require(msg.sender == admin, "Not authorized");
        _;
    }

    modifier onlyIssuer() {
        require(msg.sender == issuer, "Not issuer");
        _;
    }

    constructor() {
        admin = msg.sender;
        issuer = msg.sender;
    }

    // Rotate the direct issuer. Only the governance admin (Safe) can change it.
    function setIssuer(address newIssuer) external onlyAdmin {
        emit IssuerChanged(issuer, newIssuer);
        issuer = newIssuer;
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
    ) external onlyIssuer {
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

    // Safe-governed credential update (Phase 2 of credential-mod recovery).
    // Phase 1 (Shamir SSS) re-encrypts and pins to IPFS off-chain; this call
    // anchors the new CID and pubHash on-chain after 2-of-3 Safe approval.
    function updateCredential(
        string  calldata rollNo,
        string  calldata newCID,
        bytes32          newPubHash
    ) external onlyAdmin {
        Credential storage cred = credentialsByRollNo[rollNo];
        require(cred.exists,   "Credential not found");
        require(!cred.revoked, "Credential is revoked");

        // Invalidate old pubHash mappings
        if (cred.pubHash != bytes32(0)) {
            isValidHash[cred.pubHash] = false;
            delete rollNoByHash[cred.pubHash];
        }

        cred.ipfsCID = newCID;
        cred.pubHash = newPubHash;
        rollNoByHash[newPubHash] = rollNo;
        isValidHash[newPubHash]  = true;

        emit CredentialUpdated(rollNo, newCID, newPubHash, block.timestamp);
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
