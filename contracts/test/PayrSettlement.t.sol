// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {PayrSettlement} from "../src/PayrSettlement.sol";

interface Vm {
    function addr(uint256) external returns (address);
    function sign(uint256, bytes32) external returns (uint8, bytes32, bytes32);
    function deal(address, uint256) external;
    function warp(uint256) external;
    function chainId(uint256) external;
    function expectRevert() external;
    function expectEmit(bool, bool, bool, bool, address) external;
}

contract RejectPayee {
    receive() external payable {
        revert();
    }
}

contract ReentrantPayee {
    PayrSettlement target;
    bytes payload;
    bool public reentrySucceeded;

    constructor(PayrSettlement selected) {
        target = selected;
    }

    function arm(bytes memory data) external {
        payload = data;
    }

    receive() external payable {
        (reentrySucceeded,) = address(target).call{value: msg.value}(payload);
    }
}

contract PayrSettlementTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    PayrSettlement settlement;
    address payee = address(0xBEEF);
    bytes32 constant KEY = keccak256("invoice");
    bytes32 constant COMMITMENT = keccak256("document");
    bytes32 constant TYPEHASH = keccak256(
        "PayrPayment(bytes32 invoiceKey,bytes32 documentCommitment,address payee,uint256 amount,uint64 authorizationValidUntil,uint64 payableUntil)"
    );
    event InvoicePaid(
        bytes32 indexed invoiceKey,
        bytes32 documentCommitment,
        address indexed payer,
        address indexed payee,
        uint256 amount
    );

    function setUp() public {
        vm.chainId(5042002);
        vm.warp(1000);
        vm.deal(address(this), 100 ether);
        settlement = new PayrSettlement(vm.addr(1));
    }

    function signature(
        address recipient,
        uint256 amount,
        uint64 valid,
        uint64 deadline,
        uint256 key,
        bytes32 separator
    ) internal returns (bytes memory) {
        bytes32 digest = keccak256(
            abi.encodePacked(
                hex"1901",
                separator,
                keccak256(abi.encode(TYPEHASH, KEY, COMMITMENT, recipient, amount, valid, deadline))
            )
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    function domain(string memory name, string memory version, uint256 chain, address target)
        internal
        pure
        returns (bytes32)
    {
        return keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes(name)),
                keccak256(bytes(version)),
                chain,
                target
            )
        );
    }

    function sig() internal returns (bytes memory) {
        return signature(payee, 1 ether, 1600, 2000, 1, domain("Payr", "1", 5042002, address(settlement)));
    }

    function testExactPaymentAndEvent() public {
        bytes memory signed = sig();
        vm.expectEmit(true, true, true, true, address(settlement));
        emit InvoicePaid(KEY, COMMITMENT, address(this), payee, 1 ether);
        settlement.payInvoice{value: 1 ether}(KEY, COMMITMENT, payee, 1 ether, 1600, 2000, signed);
        require(payee.balance == 1 ether && address(settlement).balance == 0);
        require(settlement.paid(KEY));
    }

    function testReplay() public {
        bytes memory signed = sig();
        settlement.payInvoice{value: 1 ether}(KEY, COMMITMENT, payee, 1 ether, 1600, 2000, signed);
        vm.expectRevert();
        settlement.payInvoice{value: 1 ether}(KEY, COMMITMENT, payee, 1 ether, 1600, 2000, signed);
    }

    function testInclusiveAuthorizationDeadline() public {
        bytes memory signed = sig();
        vm.warp(1600);
        settlement.payInvoice{value: 1 ether}(KEY, COMMITMENT, payee, 1 ether, 1600, 2000, signed);
    }

    function testExpiredAuthorization() public {
        bytes memory signed = sig();
        vm.warp(1601);
        vm.expectRevert();
        settlement.payInvoice{value: 1 ether}(KEY, COMMITMENT, payee, 1 ether, 1600, 2000, signed);
    }

    function testAuthorizationEqualToPayableDeadline() public {
        bytes memory signed =
            signature(payee, 1 ether, 2000, 2000, 1, domain("Payr", "1", 5042002, address(settlement)));
        vm.expectRevert();
        settlement.payInvoice{value: 1 ether}(KEY, COMMITMENT, payee, 1 ether, 2000, 2000, signed);
    }

    function testAuthorizationBeyondPayableDeadline() public {
        bytes memory signed =
            signature(payee, 1 ether, 2001, 2000, 1, domain("Payr", "1", 5042002, address(settlement)));
        vm.expectRevert();
        settlement.payInvoice{value: 1 ether}(KEY, COMMITMENT, payee, 1 ether, 2001, 2000, signed);
    }

    function testPayableDeadlineBoundary() public {
        bytes memory signed = sig();
        vm.warp(2000);
        vm.expectRevert();
        settlement.payInvoice{value: 1 ether}(KEY, COMMITMENT, payee, 1 ether, 1600, 2000, signed);
    }

    function testWrongFacts() public {
        bytes memory signed = sig();
        vm.expectRevert();
        settlement.payInvoice{value: 2 ether}(KEY, COMMITMENT, payee, 1 ether, 1600, 2000, signed);
        vm.expectRevert();
        settlement.payInvoice{value: 1 ether}(KEY, COMMITMENT, address(0), 1 ether, 1600, 2000, signed);
        vm.expectRevert();
        settlement.payInvoice(KEY, COMMITMENT, payee, 0, 1600, 2000, signed);
        vm.expectRevert();
        settlement.payInvoice{value: 1 ether}(KEY, COMMITMENT, address(123), 1 ether, 1600, 2000, signed);
        vm.expectRevert();
        settlement.payInvoice{value: 2 ether}(KEY, COMMITMENT, payee, 2 ether, 1600, 2000, signed);
        vm.expectRevert();
        settlement.payInvoice{value: 1 ether}(KEY, bytes32(0), payee, 1 ether, 1600, 2000, signed);
    }

    function testWrongSignerAndDomains() public {
        bytes32[5] memory domains = [
            domain("Wrong", "1", 5042002, address(settlement)),
            domain("Payr", "2", 5042002, address(settlement)),
            domain("Payr", "1", 1, address(settlement)),
            domain("Payr", "1", 5042002, address(123)),
            domain("Payr", "1", 5042002, address(settlement))
        ];
        for (uint256 i; i < domains.length; i++) {
            bytes memory signed = signature(payee, 1 ether, 1600, 2000, i == 4 ? 2 : 1, domains[i]);
            vm.expectRevert();
            settlement.payInvoice{value: 1 ether}(KEY, COMMITMENT, payee, 1 ether, 1600, 2000, signed);
        }
    }

    function testForwardingFailureRollsBack() public {
        address recipient = address(new RejectPayee());
        bytes memory signed =
            signature(recipient, 1 ether, 1600, 2000, 1, domain("Payr", "1", 5042002, address(settlement)));
        vm.expectRevert();
        settlement.payInvoice{value: 1 ether}(KEY, COMMITMENT, recipient, 1 ether, 1600, 2000, signed);
        require(!settlement.paid(KEY) && address(settlement).balance == 0);
    }

    function testZeroAttestor() public {
        vm.expectRevert();
        new PayrSettlement(address(0));
    }

    function testGoldenDigestMatchesTypeScript() public pure {
        bytes32 separator = domain("Payr", "1", 5042002, address(0x1111111111111111111111111111111111111111));
        bytes32 digest = keccak256(
            abi.encodePacked(
                hex"1901",
                separator,
                keccak256(abi.encode(TYPEHASH, KEY, COMMITMENT, address(0xBEEF), 1 ether, uint64(1600), uint64(2000)))
            )
        );
        require(digest == 0xc82ec9352b20bdb50fb6a7b196bf453dc75465259cbcdf69d97ff4c429df04e4);
    }

    function testWrongPrimaryTypeFieldTypeAndOrder() public {
        bytes32[3] memory wrongTypes = [
            keccak256(
                "Other(bytes32 invoiceKey,bytes32 documentCommitment,address payee,uint256 amount,uint64 authorizationValidUntil,uint64 payableUntil)"
            ),
            keccak256(
                "PayrPayment(bytes32 invoiceKey,bytes32 documentCommitment,address payee,uint256 amount,uint256 authorizationValidUntil,uint64 payableUntil)"
            ),
            keccak256(
                "PayrPayment(bytes32 documentCommitment,bytes32 invoiceKey,address payee,uint256 amount,uint64 authorizationValidUntil,uint64 payableUntil)"
            )
        ];
        for (uint256 i; i < wrongTypes.length; i++) {
            bytes32 digest = keccak256(
                abi.encodePacked(
                    hex"1901",
                    domain("Payr", "1", 5042002, address(settlement)),
                    keccak256(abi.encode(wrongTypes[i], KEY, COMMITMENT, payee, 1 ether, uint64(1600), uint64(2000)))
                )
            );
            (uint8 v, bytes32 r, bytes32 s) = vm.sign(1, digest);
            vm.expectRevert();
            settlement.payInvoice{
                value: 1 ether
            }(KEY, COMMITMENT, payee, 1 ether, 1600, 2000, abi.encodePacked(r, s, v));
        }
    }

    function testReentrancyCannotSettleTwice() public {
        ReentrantPayee recipient = new ReentrantPayee(settlement);
        bytes memory signed =
            signature(address(recipient), 1 ether, 1600, 2000, 1, domain("Payr", "1", 5042002, address(settlement)));
        bytes32 secondKey = keccak256("second-invoice");
        bytes32 secondDigest = keccak256(
            abi.encodePacked(
                hex"1901",
                domain("Payr", "1", 5042002, address(settlement)),
                keccak256(abi.encode(TYPEHASH, secondKey, COMMITMENT, payee, 1 ether, uint64(1600), uint64(2000)))
            )
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(1, secondDigest);
        bytes memory secondSignature = abi.encodePacked(r, s, v);
        recipient.arm(
            abi.encodeCall(settlement.payInvoice, (secondKey, COMMITMENT, payee, 1 ether, 1600, 2000, secondSignature))
        );
        settlement.payInvoice{value: 1 ether}(KEY, COMMITMENT, address(recipient), 1 ether, 1600, 2000, signed);
        require(!recipient.reentrySucceeded() && address(recipient).balance == 1 ether && settlement.paid(KEY));
        require(!settlement.paid(secondKey));
        settlement.payInvoice{value: 1 ether}(secondKey, COMMITMENT, payee, 1 ether, 1600, 2000, secondSignature);
        require(settlement.paid(secondKey));
    }

    function testFuzzExactValue(uint96 value) public {
        if (value == 0) return;
        vm.deal(address(this), value);
        bytes memory signed = signature(payee, value, 1600, 2000, 1, domain("Payr", "1", 5042002, address(settlement)));
        settlement.payInvoice{value: value}(KEY, COMMITMENT, payee, value, 1600, 2000, signed);
        require(payee.balance == value && address(settlement).balance == 0);
    }
}
