//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import { PoseidonT3 } from "./Poseidon.sol"; //an existing library to perform Poseidon hash on solidity
import "./verifier.sol"; //inherits with the MerkleTreeInclusionProof verifier contract

contract MerkleTree is Verifier {
    uint256[] public hashes; // the Merkle tree in flattened array form
    uint256 public index = 0; // the current index of the first unfilled leaf
    uint256 public root; // the current Merkle root
  

    constructor() {
        // [assignment] initialize a Merkle tree of 8 with blank leaves
        hashes = [0, 0, 0, 0, 0, 0, 0, 0]; 
        uint256 a = 8;
        uint256 b = 8;

        for (uint256 i = 0; i < 3; i++){
            for(uint j = 0; j < 2**(2-i); j++){
            hashes.push(PoseidonT3.poseidon([hashes[a-b], hashes[a-b+1]]));
            a+1;
            b-1;
            }
        }
        root = hashes[a-1];
    }

    function insertLeaf(uint256 hashedLeaf) public returns (uint256) {
        // [assignment] insert a hashed leaf into the Merkle tree
      uint256 left;
        uint256 right;
        uint256 currentleafindex = index;
        uint256 currentLhash = hashedLeaf;

        require (currentleafindex < 8, "merkle root is full");


        for (uint256 i = 0; i < 3; i++){
            
            if(currentleafindex % 2 == 0){
                left = currentLhash;
                right = hashes[i];

            }
            else{
                left = hashes[i];
                right = currentLhash;
            }

            currentLhash = PoseidonT3.poseidon([left, right]);

            currentleafindex >>=1;
        }

        root = currentLhash;
        index +=1;

        return currentleafindex;
    }

    function verify(
            uint[2] memory a,
            uint[2][2] memory b,
            uint[2] memory c,
            uint[1] memory input
        ) public view returns (bool) {

        // [assignment] verify an inclusion proof and check that the proof root matches current root
        return verifyProof(a, b, c, input);
    }
}
