// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title WatchdogGuard
 * @notice On-chain firewall that requires a signed safety attestation from
 *         Token Watchdog before any swap can execute.  AI agents route swaps
 *         through this contract; if the attestation is missing, invalid, or
 *         the risk score is too high the transaction reverts.
 *
 *         Designed for X Layer (chainId 196) but works on any EVM chain.
 */
contract WatchdogGuard {
    // ── State ────────────────────────────────────────────────────────────

    address public owner;
    address public signer;          // Watchdog attestation key
    uint256 public maxRiskScore;    // Swaps revert when riskScore >= this value

    // ── Events ───────────────────────────────────────────────────────────

    event SwapGuarded(
        address indexed token,
        uint256 riskScore,
        address indexed agent
    );

    event SwapBlocked(
        address indexed token,
        uint256 riskScore,
        string reason
    );

    event SignerUpdated(address indexed oldSigner, address indexed newSigner);
    event MaxRiskScoreUpdated(uint256 oldMax, uint256 newMax);

    // ── Errors ───────────────────────────────────────────────────────────

    error NotOwner();
    error ZeroAddress();
    error AttestationExpired();
    error RiskTooHigh(uint256 riskScore, uint256 maxAllowed);
    error InvalidSignature();
    error RouterCallFailed(bytes returnData);

    // ── Constructor ──────────────────────────────────────────────────────

    constructor(address _signer, uint256 _maxRiskScore) {
        if (_signer == address(0)) revert ZeroAddress();
        owner = msg.sender;
        signer = _signer;
        maxRiskScore = _maxRiskScore == 0 ? 60 : _maxRiskScore;
    }

    // ── Modifiers ────────────────────────────────────────────────────────

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    // ── Core: guarded swap ───────────────────────────────────────────────

    /**
     * @notice Execute a swap through `router` only if a valid Watchdog
     *         attestation is provided.
     * @param router      DEX router / aggregator to forward the call to
     * @param swapData    Encoded calldata for the router
     * @param token       Address of the token being swapped *to*
     * @param attestation ABI-encoded (address token, uint256 riskScore,
     *                    uint256 expiry, bytes signature)
     */
    function guardedSwap(
        address router,
        bytes calldata swapData,
        address token,
        bytes calldata attestation
    ) external payable {
        // --- Decode attestation ---
        (
            address attestedToken,
            uint256 riskScore,
            uint256 expiry,
            bytes memory signature
        ) = abi.decode(attestation, (address, uint256, uint256, bytes));

        // --- Verify token match ---
        require(
            attestedToken == token,
            "WatchdogGuard: token mismatch"
        );

        // --- Verify expiry ---
        if (expiry <= block.timestamp) {
            emit SwapBlocked(token, riskScore, "attestation expired");
            revert AttestationExpired();
        }

        // --- Verify risk score ---
        if (riskScore >= maxRiskScore) {
            emit SwapBlocked(token, riskScore, "risk score too high");
            revert RiskTooHigh(riskScore, maxRiskScore);
        }

        // --- Verify signature (EIP-191 personal-sign style) ---
        bytes32 messageHash = keccak256(
            abi.encodePacked(token, riskScore, expiry, block.chainid)
        );
        bytes32 ethSignedHash = _toEthSignedMessageHash(messageHash);
        address recovered = _recover(ethSignedHash, signature);

        if (recovered != signer) {
            emit SwapBlocked(token, riskScore, "invalid signature");
            revert InvalidSignature();
        }

        // --- All checks passed — forward call to router ---
        emit SwapGuarded(token, riskScore, msg.sender);

        (bool success, bytes memory ret) = router.call{value: msg.value}(swapData);
        if (!success) revert RouterCallFailed(ret);
    }

    // ── Admin ────────────────────────────────────────────────────────────

    function setSigner(address newSigner) external onlyOwner {
        if (newSigner == address(0)) revert ZeroAddress();
        emit SignerUpdated(signer, newSigner);
        signer = newSigner;
    }

    function setMaxRiskScore(uint256 newMax) external onlyOwner {
        emit MaxRiskScoreUpdated(maxRiskScore, newMax);
        maxRiskScore = newMax;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        owner = newOwner;
    }

    // ── Allow the contract to receive native tokens (refunds, etc.) ─────

    receive() external payable {}

    // ── Internal: minimal ECDSA (no OpenZeppelin import needed) ──────────

    /**
     * @dev Prefix a hash with "\x19Ethereum Signed Message:\n32" for
     *      ecrecover compatibility (EIP-191).
     */
    function _toEthSignedMessageHash(bytes32 hash)
        internal
        pure
        returns (bytes32)
    {
        return keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", hash)
        );
    }

    /**
     * @dev Recover signer from an Ethereum signed message hash + signature.
     *      Signature must be 65 bytes (r[32] + s[32] + v[1]).
     */
    function _recover(bytes32 hash, bytes memory sig)
        internal
        pure
        returns (address)
    {
        require(sig.length == 65, "WatchdogGuard: bad sig length");

        bytes32 r;
        bytes32 s;
        uint8 v;

        assembly {
            r := mload(add(sig, 32))
            s := mload(add(sig, 64))
            v := byte(0, mload(add(sig, 96)))
        }

        // EIP-2: restrict s to lower half order to prevent malleability
        require(
            uint256(s) <= 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0,
            "WatchdogGuard: sig s too high"
        );

        if (v < 27) v += 27;
        require(v == 27 || v == 28, "WatchdogGuard: bad v value");

        address recovered = ecrecover(hash, v, r, s);
        require(recovered != address(0), "WatchdogGuard: ecrecover failed");
        return recovered;
    }
}
