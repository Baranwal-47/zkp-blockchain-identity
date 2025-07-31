const circomlib = require('circomlibjs');

async function computePoseidonHash() {
  const poseidon = await circomlib.buildPoseidon();

  // Replace these with your actual input values as BigInts
  const inputs = [
    BigInt(123),      // name
    BigInt(456),      // rollNo
    BigInt(789),      // dob
    BigInt(101112),   // phoneNo
    BigInt(131415)    // branch
  ];

  // Compute the Poseidon hashconst circomlib = require('circomlibjs');

async function computePoseidonHash() {
  const poseidon = await circomlib.buildPoseidon();

  // Replace with your actual numbers
  const inputs = [
    BigInt(123),      // name
    BigInt(456),      // rollNo
    BigInt(789),      // dob
    BigInt(101112),   // phoneNo
    BigInt(131415)    // branch
  ];

  // Compute the Poseidon hash
  const hash = poseidon(inputs);

  // Poseidon returns a BigInt, but sometimes as an array. Always use F.toString()
  const F = poseidon.F;
  console.log(F.toString(hash));
}

computePoseidonHash();

  const hash = poseidon(inputs);

  // Output as decimal string (for use in input.json)
  console.log(hash.toString());
}

computePoseidonHash();
