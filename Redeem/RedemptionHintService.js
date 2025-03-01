import {
    vesselManagerAbi,
    adminAbi,
    priceOracleAbi,
} from "../ABI/abi.js";

import { ethers } from "ethers";

class RedemptionHintService {
    constructor(vesselManagerContract, adminContract, priceOracleContract) {
        this.vesselManagerContract = vesselManagerContract;
        this.adminContract = adminContract;
        this.priceOracleContract = priceOracleContract;
        this.DECIMAL_PRECISION = 1e18;
        this.PERCENTAGE_PRECISION = 10000; // 100_00
        this.redemptionSofteningParam = 9700; // Default value, should be fetched from contract
    }

    async getRedemptionHints(asset, debtTokenAmount, maxIterations = 0) {
        try {
            const ethProvider = new ethers.JsonRpcProvider("https://node.botanixlabs.dev");
            // Get sorted vessels from API
            const sortedVessels = await this.fetchSortedVessels(asset);
            // console.log("sortedVessels", sortedVessels);

            const priceOracleContract = new ethers.Contract(
                this.priceOracleContract,
                priceOracleAbi,
                ethProvider
            );

            const adminContract = new ethers.Contract(
                this.adminContract,
                adminAbi,
                ethProvider
            );

            const vesselManagerContract = new ethers.Contract(
                this.vesselManagerContract,
                vesselManagerAbi,
                ethProvider
            );

            const price = await priceOracleContract.latestRoundData();
            console.log("price", price.answer);
            
            // Get MCR from admin contract
            const mcr = await adminContract.getMcr(asset);
            console.log("mcr", mcr);
            let remainingDebt = debtTokenAmount;
            let firstRedemptionHint = null;
            let partialRedemptionHintNewICR = 0;
            let currentVesselIndex = 0;
            
            // Find first vessel with ICR >= MCR
            while (currentVesselIndex < sortedVessels.length) {
                const vessel = sortedVessels[currentVesselIndex];
                const icr = this.convertLTVtoICR(vessel.nltv);
                
                if (icr >= mcr) {
                    firstRedemptionHint = vessel.walletaddress;
                    break;
                }
                currentVesselIndex++;
            } 

            if (!firstRedemptionHint) {
                return {
                    firstRedemptionHint: "0x0000000000000000000000000000000000000000",
                    partialRedemptionHintNewICR: 0,
                    truncatedDebtTokenAmount: 0
                };
            }

            // Set max iterations if not provided
            if (maxIterations === 0) {
                maxIterations = Number.MAX_SAFE_INTEGER;
            }

            // Process vessels for redemption
            while (currentVesselIndex < sortedVessels.length && remainingDebt > 0 && maxIterations > 0) {
                const currentVessel = sortedVessels[currentVesselIndex];
                
                // Get vessel details from contract
                const vesselDebt = await vesselManagerContract.getVesselDebt(asset, currentVessel.walletaddress);
                const pendingDebt = await vesselManagerContract.getPendingDebtTokenReward(asset, currentVessel.walletaddress);
                const currentVesselNetDebt = this.getNetDebt(vesselDebt.add(pendingDebt));

                if (currentVesselNetDebt <= remainingDebt) {
                    remainingDebt -= currentVesselNetDebt;
                } else {
                    const minNetDebt = await this.adminContract.getMinNetDebt(asset);
                    
                    if (currentVesselNetDebt > minNetDebt) {
                        const maxRedeemableDebt = Math.min(
                            remainingDebt,
                            currentVesselNetDebt - minNetDebt
                        );

                        const vesselColl = await this.vesselManagerContract.getVesselColl(asset, currentVessel.walletaddress);
                        const pendingColl = await this.vesselManagerContract.getPendingAssetReward(asset, currentVessel.walletaddress);
                        const currentVesselColl = vesselColl.add(pendingColl);

                        let collLot = (maxRedeemableDebt * this.DECIMAL_PRECISION) / this.price;
                        collLot = (collLot * this.redemptionSofteningParam) / this.PERCENTAGE_PRECISION;
                        
                        const newColl = currentVesselColl - collLot;
                        const newDebt = currentVesselNetDebt - maxRedeemableDebt;
                        const compositeDebt = this.getCompositeDebt(newDebt);

                        partialRedemptionHintNewICR = this.computeNominalCR(newColl, compositeDebt);
                        remainingDebt -= maxRedeemableDebt;
                    }
                    break;
                }

                currentVesselIndex++;
                maxIterations--;
            }

            const truncatedDebtTokenAmount = debtTokenAmount - remainingDebt;

            return {
                firstRedemptionHint,
                partialRedemptionHintNewICR,
                truncatedDebtTokenAmount
            };

        } catch (error) {
            console.error("Error in getRedemptionHints:", error);
            throw error;
        }
    }

    // Helper functions
    convertLTVtoICR(ltv) {
        // Convert LTV to ICR (Inverse of LTV)
        return (100 * this.DECIMAL_PRECISION) / ltv;
    }

    computeNominalCR(coll, debt) {
        if (debt === 0) {
            return Number.MAX_SAFE_INTEGER;
        }
        return (coll * this.DECIMAL_PRECISION) / debt;
    }

    getNetDebt(debt) {
        // Implementation depends on your specific requirements
        return debt;
    }

    getCompositeDebt(debt) {
        // Implementation depends on your specific requirements
        return debt;
    }

    async fetchSortedVessels(asset) {
        // Implement API call to get sorted vessels
        const response = await fetch(`https://api.palladiumlabs.org/admin/positionvalue`);
        const data = await response.json();
        return data.data;
    }
}

export { RedemptionHintService };

// Usage example:
/*
const hintService = new RedemptionHintService(
    vesselManagerContract, // Web3 contract instance
    adminContract, // Web3 contract instance
    price // Current price
);

const hints = await hintService.getRedemptionHints(
    assetAddress,
    debtTokenAmount,
    maxIterations
);
*/