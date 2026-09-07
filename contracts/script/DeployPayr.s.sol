// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {PayrSettlement} from "../src/PayrSettlement.sol";

interface DeployVm {
    function envUint(string calldata) external returns (uint256);
    function envAddress(string calldata) external returns (address);
    function startBroadcast() external;
    function stopBroadcast() external;
}

contract DeployPayr {
    DeployVm constant vm = DeployVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function run() external returns (PayrSettlement deployed) {
        require(block.chainid == 5042002, "Arc testnet only");
        require(vm.envUint("RUN_LIVE_ARC_DEPLOYMENT") == 1, "Operator approval required");
        address selectedAttestor = vm.envAddress("PAYR_ATTESTOR_ADDRESS");
        require(selectedAttestor != address(0), "Nonzero attestor required");
        vm.startBroadcast();
        deployed = new PayrSettlement(selectedAttestor);
        vm.stopBroadcast();
        require(deployed.attestor() == selectedAttestor, "Attestor mismatch");
    }
}
