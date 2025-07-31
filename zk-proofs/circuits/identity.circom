pragma circom 2.1.6;

include "poseidon.circom";

// Template for digital identity proof
template Identity() {
    // Private inputs: user attributes as field elements
    signal input name;     
    signal input rollNo;   
    signal input dob;       
    signal input phoneNo;  
    signal input branch;    

    // Public output: the computed hash of all attributes
    signal output pubHash;

    // Hash the attributes together
    component hasher = Poseidon(5);
    hasher.inputs[0] <== name;
    hasher.inputs[1] <== rollNo;
    hasher.inputs[2] <== dob;
    hasher.inputs[3] <== phoneNo;
    hasher.inputs[4] <== branch;

    // Output the computed hash as public signal
    pubHash <== hasher.out;
}

// Expose the main component
component main = Identity();
