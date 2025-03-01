import { RedemptionHintService } from "./RedemptionHintService.js";

// import * as dotenv from "dotenv";
// dotenv.config();
async function getRedemptionHint() {
    const hintService = new RedemptionHintService(
        "0x2Fef509fA966B614483B411f8cA3208C26da3c4b", // Web3 contract vesslemanger
        "0x36F40faDe724ECd183b6E93F2448de65207b08A2", // Web3 contract admin
        "0xc014933c805825D335e23Ef12eB92d2471D41DA7" // Web3 contract priceOracle
    );

    
    
    const hints = await hintService.getRedemptionHints(
        "0x321f90864fb21cdcddD0D67FE5e4Cbc812eC9e64",
        100,
        50
    );
    console.log(hints);
}

getRedemptionHint();