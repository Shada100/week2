pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/switcher.circom";


template CheckRoot(n) { // compute the root of a MerkleTree of n Levels 
    signal input leaves[2**n];
    signal output root;

    //[assignment] insert your code here to calculate the Merkle root from 2^n leaves
    //total number of leaves
    var total = 2**n;
    //number of pairs to hash
    var numofdoubleleafs = total - 1;
    //number of pairs to hash in the first level of the merkle tree
    var numoof1stleveldouble = total / 2;
    //number of pairs to hash after hashing the first level of the merkle tree
    var numofintermediaryleafs = numoof1stleveldouble - 1;

    component hasher[numofdoubleleafs];

    //to have an array of all pairs needed to be hashed 
    var i;
    for(i = 0; i < numofdoubleleafs; i++){
        hasher[i] = Poseidon(2);
    }

    //to insert the leaves data into the hasher inputs
    for(i = 0; i < numoof1stleveldouble; i++){
        hasher[i].inputs[0] <== leaves[i*2];
        hasher[i].inputs[1] <== leaves[i*2+1];
    }

    //to hash every single double up unto the last 2 pairs and put the out put into their parent 
    var m = 0;
    for(i = numoof1stleveldouble; i < numoof1stleveldouble + numofintermediaryleafs; i++){
        hasher[i].inputs[0] <== hasher[m*2].out;
        hasher[i].inputs[1] <== hasher[m*2+1].out;
        m++;
    }

    // to put in the output of the final hash to this circuit's output
    root <== hasher[numofdoubleleafs - 1].out;
}

template MerkleTreeInclusionProof(n) {
    signal input leaf;
    signal input path_elements[n];
    signal input path_index[n]; // path index are 0's and 1's indicating whether the current element is on the left or right
    signal output root; // note that this is an OUTPUT signal

    //[assignment] insert your code here to compute the root from a leaf and elements along the path
    component selector[n];
    component hashers[n];

    for (var i = 0; i < n; i++){
        selector[i] = Switcher();
        hashers[i] = Poseidon(2);

        selector[i].L <== i == 0 ? leaf : hashers[i-1].out ;
        
        path_index[i] ==> selector[i].sel;
        path_elements[i] ==> selector[i].R;
        
        selector[i].outL ==> hashers[i].inputs[0];
        selector[i].outR ==> hashers[i].inputs[1];
        }

    root <== hashers[n-1].out;
}
