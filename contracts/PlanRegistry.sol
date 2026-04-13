// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract PlanRegistry {
    struct PlanRecord {
        bytes32 reportHash;
        bytes32 portfolioHash;
        address submitter;
        uint64 recordedAt;
        string sessionId;
        string summaryUri;
    }

    mapping(bytes32 attestationHash => PlanRecord) private planRecords;

    error PlanAlreadyRegistered(bytes32 attestationHash);
    error PlanNotFound(bytes32 attestationHash);
    error InvalidAttestationHash();
    error InvalidReportHash();
    error InvalidPortfolioHash();
    error InvalidSessionId();

    event PlanRegistered(
        bytes32 indexed attestationHash,
        address indexed submitter,
        bytes32 reportHash,
        bytes32 portfolioHash,
        string sessionId,
        string summaryUri,
        uint256 recordedAt
    );

    function registerPlan(
        bytes32 reportHash,
        bytes32 portfolioHash,
        bytes32 attestationHash,
        string calldata sessionId,
        string calldata summaryUri
    ) external {
        if (reportHash == bytes32(0)) {
            revert InvalidReportHash();
        }
        if (portfolioHash == bytes32(0)) {
            revert InvalidPortfolioHash();
        }
        if (attestationHash == bytes32(0)) {
            revert InvalidAttestationHash();
        }
        if (bytes(sessionId).length == 0) {
            revert InvalidSessionId();
        }
        if (planRecords[attestationHash].submitter != address(0)) {
            revert PlanAlreadyRegistered(attestationHash);
        }

        planRecords[attestationHash] = PlanRecord({
            reportHash: reportHash,
            portfolioHash: portfolioHash,
            submitter: msg.sender,
            recordedAt: uint64(block.timestamp),
            sessionId: sessionId,
            summaryUri: summaryUri
        });

        emit PlanRegistered(
            attestationHash,
            msg.sender,
            reportHash,
            portfolioHash,
            sessionId,
            summaryUri,
            block.timestamp
        );
    }

    function getPlan(bytes32 attestationHash) external view returns (PlanRecord memory) {
        PlanRecord memory record = planRecords[attestationHash];
        if (record.submitter == address(0)) {
            revert PlanNotFound(attestationHash);
        }
        return record;
    }
}
