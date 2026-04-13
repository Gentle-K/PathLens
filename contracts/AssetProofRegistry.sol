// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract AssetProofRegistry {
    struct AssetProofRecord {
        bytes32 snapshotHash;
        string assetId;
        string snapshotUri;
        string proofType;
        address attester;
        uint64 effectiveAt;
        uint64 recordedAt;
    }

    struct AssetProofInput {
        bytes32 snapshotHash;
        bytes32 proofKey;
        string assetId;
        string snapshotUri;
        string proofType;
        uint64 effectiveAt;
    }

    address public owner;
    address public pendingOwner;

    mapping(address attester => bool enabled) public attesters;
    mapping(bytes32 proofKey => AssetProofRecord) private proofRecords;
    mapping(bytes32 assetHash => bytes32 latestProofKey) private latestProofKeyByAssetHash;
    mapping(bytes32 assetHash => bytes32[] proofKeys) private proofHistoryByAssetHash;

    error AssetProofAlreadyRegistered(bytes32 proofKey);
    error AssetProofNotFound(bytes32 proofKey);
    error UnauthorizedAttester(address attester);
    error UnauthorizedOwner(address caller);
    error UnauthorizedPendingOwner(address caller);
    error InvalidOwner(address owner);
    error InvalidAttester(address attester);
    error InvalidAssetId();
    error InvalidProofKey();
    error InvalidSnapshotHash();

    event AttesterUpdated(address indexed attester, bool enabled);
    event OwnershipTransferStarted(address indexed previousOwner, address indexed pendingOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event AssetProofRegistered(
        bytes32 indexed proofKey,
        bytes32 indexed snapshotHash,
        address indexed attester,
        string assetId,
        string snapshotUri,
        string proofType,
        uint256 effectiveAt,
        uint256 recordedAt
    );
    event AssetProofLatestUpdated(
        bytes32 indexed assetHash,
        string assetId,
        bytes32 indexed proofKey
    );

    modifier onlyOwner() {
        if (msg.sender != owner) {
            revert UnauthorizedOwner(msg.sender);
        }
        _;
    }

    modifier onlyAuthorizedAttester() {
        if (!attesters[msg.sender]) {
            revert UnauthorizedAttester(msg.sender);
        }
        _;
    }

    constructor() {
        owner = msg.sender;
        attesters[msg.sender] = true;
        emit OwnershipTransferred(address(0), msg.sender);
        emit AttesterUpdated(msg.sender, true);
    }

    function setAttester(address attester, bool enabled) external onlyOwner {
        if (attester == address(0)) {
            revert InvalidAttester(attester);
        }
        attesters[attester] = enabled;
        emit AttesterUpdated(attester, enabled);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) {
            revert InvalidOwner(newOwner);
        }
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    function acceptOwnership() external {
        if (msg.sender != pendingOwner) {
            revert UnauthorizedPendingOwner(msg.sender);
        }
        address previousOwner = owner;
        owner = msg.sender;
        pendingOwner = address(0);
        emit OwnershipTransferred(previousOwner, msg.sender);
    }

    function registerAssetProof(
        bytes32 snapshotHash,
        bytes32 proofKey,
        string calldata assetId,
        string calldata snapshotUri,
        string calldata proofType,
        uint64 effectiveAt
    ) external onlyAuthorizedAttester {
        _registerAssetProof(
            AssetProofInput({
                snapshotHash: snapshotHash,
                proofKey: proofKey,
                assetId: assetId,
                snapshotUri: snapshotUri,
                proofType: proofType,
                effectiveAt: effectiveAt
            })
        );
    }

    function publishAssetProofBatch(AssetProofInput[] calldata proofs) external onlyAuthorizedAttester {
        uint256 length = proofs.length;
        for (uint256 index = 0; index < length; index++) {
            _registerAssetProof(proofs[index]);
        }
    }

    function getAssetProof(bytes32 proofKey) external view returns (AssetProofRecord memory) {
        AssetProofRecord memory record = proofRecords[proofKey];
        if (record.attester == address(0)) {
            revert AssetProofNotFound(proofKey);
        }
        return record;
    }

    function getLatestProofKey(string calldata assetId) external view returns (bytes32) {
        return latestProofKeyByAssetHash[_assetHash(assetId)];
    }

    function getLatestAssetProof(string calldata assetId) external view returns (AssetProofRecord memory) {
        bytes32 proofKey = latestProofKeyByAssetHash[_assetHash(assetId)];
        AssetProofRecord memory record = proofRecords[proofKey];
        if (record.attester == address(0)) {
            revert AssetProofNotFound(proofKey);
        }
        return record;
    }

    function getProofHistory(string calldata assetId) external view returns (bytes32[] memory) {
        return proofHistoryByAssetHash[_assetHash(assetId)];
    }

    function _registerAssetProof(AssetProofInput memory proof) internal {
        if (proof.proofKey == bytes32(0)) {
            revert InvalidProofKey();
        }
        if (proof.snapshotHash == bytes32(0)) {
            revert InvalidSnapshotHash();
        }
        if (bytes(proof.assetId).length == 0) {
            revert InvalidAssetId();
        }
        if (proofRecords[proof.proofKey].attester != address(0)) {
            revert AssetProofAlreadyRegistered(proof.proofKey);
        }

        proofRecords[proof.proofKey] = AssetProofRecord({
            snapshotHash: proof.snapshotHash,
            assetId: proof.assetId,
            snapshotUri: proof.snapshotUri,
            proofType: proof.proofType,
            attester: msg.sender,
            effectiveAt: proof.effectiveAt,
            recordedAt: uint64(block.timestamp)
        });

        bytes32 assetHash = _assetHash(proof.assetId);
        latestProofKeyByAssetHash[assetHash] = proof.proofKey;
        proofHistoryByAssetHash[assetHash].push(proof.proofKey);

        emit AssetProofRegistered(
            proof.proofKey,
            proof.snapshotHash,
            msg.sender,
            proof.assetId,
            proof.snapshotUri,
            proof.proofType,
            proof.effectiveAt,
            block.timestamp
        );
        emit AssetProofLatestUpdated(assetHash, proof.assetId, proof.proofKey);
    }

    function _assetHash(string memory assetId) internal pure returns (bytes32) {
        return keccak256(bytes(assetId));
    }
}
