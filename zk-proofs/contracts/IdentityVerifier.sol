// SPDX-License-Identifier: GPL-3.0
/*
    Copyright 2021 0KIMS association.

    This file is generated with [snarkJS](https://github.com/iden3/snarkjs).

    snarkJS is a free software: you can redistribute it and/or modify it
    under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    snarkJS is distributed in the hope that it will be useful, but WITHOUT
    ANY WARRANTY; without even the implied warranty of MERCHANTABILITY
    or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public
    License for more details.

    You should have received a copy of the GNU General Public License
    along with snarkJS. If not, see <https://www.gnu.org/licenses/>.
*/

pragma solidity >=0.7.0 <0.9.0;

contract Groth16Verifier {
    // Scalar field size
    uint256 constant r    = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    // Base field size
    uint256 constant q   = 21888242871839275222246405745257275088696311157297823662689037894645226208583;

    // Verification Key data
    uint256 constant alphax  = 20491192805390485299153009773594534940189261866228447918068658471970481763042;
    uint256 constant alphay  = 9383485363053290200918347156157836566562967994039712273449902621266178545958;
    uint256 constant betax1  = 4252822878758300859123897981450591353533073413197771768651442665752259397132;
    uint256 constant betax2  = 6375614351688725206403948262868962793625744043794305715222011528459656738731;
    uint256 constant betay1  = 21847035105528745403288232691147584728191162732299865338377159692350059136679;
    uint256 constant betay2  = 10505242626370262277552901082094356697409835680220590971873171140371331206856;
    uint256 constant gammax1 = 11559732032986387107991004021392285783925812861821192530917403151452391805634;
    uint256 constant gammax2 = 10857046999023057135944570762232829481370756359578518086990519993285655852781;
    uint256 constant gammay1 = 4082367875863433681332203403145435568316851327593401208105741076214120093531;
    uint256 constant gammay2 = 8495653923123431417604973247489272438418190587263600148770280649306958101930;
    uint256 constant deltax1 = 10187726720683080876519274147676812627494744063372375020282656459967155881949;
    uint256 constant deltax2 = 20730203652186343134377065961165021321339906763704730445237133894572332858869;
    uint256 constant deltay1 = 14388086500982846476640757966829740873183562998839375360186747225426084829026;
    uint256 constant deltay2 = 977024891238284388828082424810548756013602177982295873913937669164342980496;

    
    uint256 constant IC0x = 9657028047128702212841483355217875808987684676311686805911136105406411679000;
    uint256 constant IC0y = 6382667408523500347362717815089398191678790885548754046451267201924916279557;
    
    uint256 constant IC1x = 19228753825414659915123269899483717548410730680433316916825270571589384732818;
    uint256 constant IC1y = 3690124821486291039901927214087128258728644005524053309260461966844238504694;
    
    uint256 constant IC2x = 16223076529783796408255899324605988492704669648926333242135076379948624379647;
    uint256 constant IC2y = 137099667713315491889830961648976100485071005532479950131662379811491024015;
    
    uint256 constant IC3x = 7771155570286510359316900305843855271330580022540264675180612267299642490902;
    uint256 constant IC3y = 17153515993690566711311703675264515581867391427216379435162485190026066180941;
    
    uint256 constant IC4x = 19869344353861405188850181341359858822353790274712180342869008101831763209070;
    uint256 constant IC4y = 10711657574999796825041984736423498686225651957190693267424582684655860210083;
    
    uint256 constant IC5x = 18002939499768197982155052506820391966326739256851471393680622139789304876348;
    uint256 constant IC5y = 18217178803050060111924127034614033752084915254912993831017222135653032176529;
    
    uint256 constant IC6x = 7578419846285197364064744581998962309058596554863920015719385337684214954705;
    uint256 constant IC6y = 7068922871339504886030012318908382748057897616209657216472741896207912104962;
    
    uint256 constant IC7x = 17683624311016923240107754880411038511106762573777970248492527280978054063793;
    uint256 constant IC7y = 6031733150469525013123654181284110809119803596494211443810725567563328482449;
    
    uint256 constant IC8x = 4833560397886514152832812398688510754919504326772672252047007172322872083009;
    uint256 constant IC8y = 19427553552806342622913530434371233204324947823060627079239506596628763496750;
    
    uint256 constant IC9x = 21520366868981087817339474298710088338722453029637962478926343291582152803938;
    uint256 constant IC9y = 17300569226717532557430555349016691862628884193567681070733162046360832942258;
    
    uint256 constant IC10x = 3118851462818502301678863852794249648619140407559284046164362628846492997770;
    uint256 constant IC10y = 2871276419416109352579741873814596399457159703855306711628199014676837190784;
    
    uint256 constant IC11x = 6975067567391555597964671392096637471431146075686109531122712046261149691023;
    uint256 constant IC11y = 1862814786689886462094899971713545745217472710222211094436941635087785572567;
    
    uint256 constant IC12x = 12249572230300753913836109089416107792366067529282309805399337287908507914516;
    uint256 constant IC12y = 4404521272629571462562498401907758571259309792149207243347899956197231653103;
    
    uint256 constant IC13x = 13581135408883216920030937444692607770251016209501046328492882671459085547354;
    uint256 constant IC13y = 5710850640517756317303705415969306774278154360321488436986505793295159608419;
    
    uint256 constant IC14x = 19371438308188177821267792818395991049751616614243365322649614863269845530579;
    uint256 constant IC14y = 20775317916558934959003705163836180374195791168079952881310036347565820372479;
    
    uint256 constant IC15x = 18997776763760098705102947997760206866047383302239080218674610732279206845508;
    uint256 constant IC15y = 3983833892170596732228033837991673094206394117839297920897860100418843003726;
    
    uint256 constant IC16x = 16842617750927351718264442966636757219344239263432191707883020888041254678001;
    uint256 constant IC16y = 18408096871753168885048369725976763172693356895446987994637711348639009590944;
    
    uint256 constant IC17x = 18701540044743454479964247146185819020200225236014905727709945706664140091384;
    uint256 constant IC17y = 6716370671216854532073864871618970060866825924967642352114715660041433503966;
    
    uint256 constant IC18x = 5645607971569781272199037196188694282498545198771673691530292524905910753793;
    uint256 constant IC18y = 12971348236365022066199136562277871870757322542770866552702830370939463379631;
    
    uint256 constant IC19x = 2686946152537789939362702017775352226975111434988985117612599030692033548802;
    uint256 constant IC19y = 18632210207929715426333933096510323473782709514275096145955303000815451304216;
    
 
    // Memory data
    uint16 constant pVk = 0;
    uint16 constant pPairing = 128;

    uint16 constant pLastMem = 896;

    function verifyProof(uint[2] calldata _pA, uint[2][2] calldata _pB, uint[2] calldata _pC, uint[19] calldata _pubSignals) public view returns (bool) {
        assembly {
            function checkField(v) {
                if iszero(lt(v, r)) {
                    mstore(0, 0)
                    return(0, 0x20)
                }
            }
            
            // G1 function to multiply a G1 value(x,y) to value in an address
            function g1_mulAccC(pR, x, y, s) {
                let success
                let mIn := mload(0x40)
                mstore(mIn, x)
                mstore(add(mIn, 32), y)
                mstore(add(mIn, 64), s)

                success := staticcall(sub(gas(), 2000), 7, mIn, 96, mIn, 64)

                if iszero(success) {
                    mstore(0, 0)
                    return(0, 0x20)
                }

                mstore(add(mIn, 64), mload(pR))
                mstore(add(mIn, 96), mload(add(pR, 32)))

                success := staticcall(sub(gas(), 2000), 6, mIn, 128, pR, 64)

                if iszero(success) {
                    mstore(0, 0)
                    return(0, 0x20)
                }
            }

            function checkPairing(pA, pB, pC, pubSignals, pMem) -> isOk {
                let _pPairing := add(pMem, pPairing)
                let _pVk := add(pMem, pVk)

                mstore(_pVk, IC0x)
                mstore(add(_pVk, 32), IC0y)

                // Compute the linear combination vk_x
                
                g1_mulAccC(_pVk, IC1x, IC1y, calldataload(add(pubSignals, 0)))
                
                g1_mulAccC(_pVk, IC2x, IC2y, calldataload(add(pubSignals, 32)))
                
                g1_mulAccC(_pVk, IC3x, IC3y, calldataload(add(pubSignals, 64)))
                
                g1_mulAccC(_pVk, IC4x, IC4y, calldataload(add(pubSignals, 96)))
                
                g1_mulAccC(_pVk, IC5x, IC5y, calldataload(add(pubSignals, 128)))
                
                g1_mulAccC(_pVk, IC6x, IC6y, calldataload(add(pubSignals, 160)))
                
                g1_mulAccC(_pVk, IC7x, IC7y, calldataload(add(pubSignals, 192)))
                
                g1_mulAccC(_pVk, IC8x, IC8y, calldataload(add(pubSignals, 224)))
                
                g1_mulAccC(_pVk, IC9x, IC9y, calldataload(add(pubSignals, 256)))
                
                g1_mulAccC(_pVk, IC10x, IC10y, calldataload(add(pubSignals, 288)))
                
                g1_mulAccC(_pVk, IC11x, IC11y, calldataload(add(pubSignals, 320)))
                
                g1_mulAccC(_pVk, IC12x, IC12y, calldataload(add(pubSignals, 352)))
                
                g1_mulAccC(_pVk, IC13x, IC13y, calldataload(add(pubSignals, 384)))
                
                g1_mulAccC(_pVk, IC14x, IC14y, calldataload(add(pubSignals, 416)))
                
                g1_mulAccC(_pVk, IC15x, IC15y, calldataload(add(pubSignals, 448)))
                
                g1_mulAccC(_pVk, IC16x, IC16y, calldataload(add(pubSignals, 480)))
                
                g1_mulAccC(_pVk, IC17x, IC17y, calldataload(add(pubSignals, 512)))
                
                g1_mulAccC(_pVk, IC18x, IC18y, calldataload(add(pubSignals, 544)))
                
                g1_mulAccC(_pVk, IC19x, IC19y, calldataload(add(pubSignals, 576)))
                

                // -A
                mstore(_pPairing, calldataload(pA))
                mstore(add(_pPairing, 32), mod(sub(q, calldataload(add(pA, 32))), q))

                // B
                mstore(add(_pPairing, 64), calldataload(pB))
                mstore(add(_pPairing, 96), calldataload(add(pB, 32)))
                mstore(add(_pPairing, 128), calldataload(add(pB, 64)))
                mstore(add(_pPairing, 160), calldataload(add(pB, 96)))

                // alpha1
                mstore(add(_pPairing, 192), alphax)
                mstore(add(_pPairing, 224), alphay)

                // beta2
                mstore(add(_pPairing, 256), betax1)
                mstore(add(_pPairing, 288), betax2)
                mstore(add(_pPairing, 320), betay1)
                mstore(add(_pPairing, 352), betay2)

                // vk_x
                mstore(add(_pPairing, 384), mload(add(pMem, pVk)))
                mstore(add(_pPairing, 416), mload(add(pMem, add(pVk, 32))))


                // gamma2
                mstore(add(_pPairing, 448), gammax1)
                mstore(add(_pPairing, 480), gammax2)
                mstore(add(_pPairing, 512), gammay1)
                mstore(add(_pPairing, 544), gammay2)

                // C
                mstore(add(_pPairing, 576), calldataload(pC))
                mstore(add(_pPairing, 608), calldataload(add(pC, 32)))

                // delta2
                mstore(add(_pPairing, 640), deltax1)
                mstore(add(_pPairing, 672), deltax2)
                mstore(add(_pPairing, 704), deltay1)
                mstore(add(_pPairing, 736), deltay2)


                let success := staticcall(sub(gas(), 2000), 8, _pPairing, 768, _pPairing, 0x20)

                isOk := and(success, mload(_pPairing))
            }

            let pMem := mload(0x40)
            mstore(0x40, add(pMem, pLastMem))

            // Validate that all evaluations ∈ F
            
            checkField(calldataload(add(_pubSignals, 0)))
            
            checkField(calldataload(add(_pubSignals, 32)))
            
            checkField(calldataload(add(_pubSignals, 64)))
            
            checkField(calldataload(add(_pubSignals, 96)))
            
            checkField(calldataload(add(_pubSignals, 128)))
            
            checkField(calldataload(add(_pubSignals, 160)))
            
            checkField(calldataload(add(_pubSignals, 192)))
            
            checkField(calldataload(add(_pubSignals, 224)))
            
            checkField(calldataload(add(_pubSignals, 256)))
            
            checkField(calldataload(add(_pubSignals, 288)))
            
            checkField(calldataload(add(_pubSignals, 320)))
            
            checkField(calldataload(add(_pubSignals, 352)))
            
            checkField(calldataload(add(_pubSignals, 384)))
            
            checkField(calldataload(add(_pubSignals, 416)))
            
            checkField(calldataload(add(_pubSignals, 448)))
            
            checkField(calldataload(add(_pubSignals, 480)))
            
            checkField(calldataload(add(_pubSignals, 512)))
            
            checkField(calldataload(add(_pubSignals, 544)))
            
            checkField(calldataload(add(_pubSignals, 576)))
            

            // Validate all evaluations
            let isValid := checkPairing(_pA, _pB, _pC, _pubSignals, pMem)

            mstore(0, isValid)
             return(0, 0x20)
         }
     }
 }
