// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract PayrSettlement is EIP712, ReentrancyGuard {
    address public immutable attestor;
    mapping(bytes32 => bool) public paid;
    bytes32 public constant PAYMENT_TYPEHASH = keccak256(
        "PayrPayment(bytes32 invoiceKey,bytes32 documentCommitment,address payee,uint256 amount,uint64 authorizationValidUntil,uint64 payableUntil)"
    );

    error InvalidPayment();
    error InvalidAuthorization();
    error AlreadyPaid();
    error ForwardingFailed();

    event InvoicePaid(
        bytes32 indexed invoiceKey,
        bytes32 documentCommitment,
        address indexed payer,
        address indexed payee,
        uint256 amount
    );

    constructor(address selectedAttestor) EIP712("Payr", "1") {
        if (selectedAttestor == address(0)) revert InvalidAuthorization();
        attestor = selectedAttestor;
    }

    function payInvoice(
        bytes32 invoiceKey,
        bytes32 documentCommitment,
        address payee,
        uint256 amount,
        uint64 authorizationValidUntil,
        uint64 payableUntil,
        bytes calldata signature
    ) external payable nonReentrant {
        if (payee == address(0) || amount == 0 || msg.value != amount) revert InvalidPayment();
        if (
            block.timestamp > authorizationValidUntil || authorizationValidUntil >= payableUntil
                || block.timestamp >= payableUntil
        ) revert InvalidAuthorization();
        if (paid[invoiceKey]) revert AlreadyPaid();
        bytes32 digest = _hashTypedDataV4(
            keccak256(
                abi.encode(
                    PAYMENT_TYPEHASH,
                    invoiceKey,
                    documentCommitment,
                    payee,
                    amount,
                    authorizationValidUntil,
                    payableUntil
                )
            )
        );
        if (ECDSA.recover(digest, signature) != attestor) revert InvalidAuthorization();
        paid[invoiceKey] = true;
        (bool forwarded,) = payee.call{value: amount}("");
        if (!forwarded) revert ForwardingFailed();
        emit InvoicePaid(invoiceKey, documentCommitment, msg.sender, payee, amount);
    }
}
