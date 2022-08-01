const { assert, expect } = require("chai")
const { getNamedAccounts, deployments, ethers, network } = require("hardhat")
const { developmentChains, networkConfig } = require("../../helper.hardhat.config")

developmentChains.includes(network.name)
    ? describe.skip
    : describe("Raffle Staging Tests", function () {
          let raffle, raffleEntranceFee, deployer

          beforeEach(async function () {
              deployer = (await getNamedAccounts()).deployer
              raffle = await ethers.getContract("Raffle", deployer)
              raffleEntranceFee = await raffle.getEntranceFee()
          })

          describe("fulfillRandomWords", function () {
              it("works with live Chainlink Keepers and Chainlink VRF, we get a random winner", async function () {
                  const startingTimeStamp = await raffle.getLastTimeStamp()
                  const accounts = await ethers.getSigners()

                  await new Promise(async (resolve, reject) => {
                      raffle.once("WinnerPicked", async () => {
                          console.log("WinnerPicked event fired!")
                          try {
                              const recentWinner = await raffle.getRecentWinner()
                              const raffleState = await raffle.getRaffleState()
                              const winnerEndingBalance = await accounts[0].getBalance()
                              const endingTimeStamp = await raffle.getLastTimeStamp()

                              await expect(raffle.getPlayer(0)).to.be.reverted
                              assert.equal(recentWinner.toString(), accounts[0].address)
                              assert.equal(raffleState, 0)
                              assert.equal(
                                  winnerEndingBalance.toString(),
                                  winnerStartingBalance.add(raffleEntranceFee).toString()
                              )
                              assert(endingTimeStamp > startingTimeStamp)
                              resolve()
                          } catch (error) {
                              console.log(error)
                              reject(error)
                          }
                      })
                      //  entering the raffle
                      console.log("Entering Raffle...")
                      const tx = await raffle.enterRaffle({ value: raffleEntranceFee })
                      await tx.wait(1)
                      const winnerStartingBalance = await accounts[0].getBalance()
                  })
              })
          })
      })

// const { assert, expect } = require("chai")
// const { network, getNamedAccounts, deployments, ethers } = require("hardhat")
// const { isCallTrace } = require("hardhat/internal/hardhat-network/stack-traces/message-trace")
// const { developmentChains, networkConfig } = require("../../helper.hardhat.config")

// developmentChains.includes(network.name)
//     ? describe.skip
//     : describe("Raffle unit test", async () => {
//           let raffle, raffleEntranceFee, deployer
//           const chainId = network.config.chainId

//           beforeEach(async () => {
//               deployer = (await getNamedAccounts()).deployer
//               await deployments.fixture(["all"])
//               raffle = await ethers.getContract("Raffle", deployer) //get the deployed contract and connect it to the deployer
//               vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock", deployer)
//               raffleEntranceFee = await raffle.getEntranceFee()
//               interval = await raffle.getLastTimeStamp()
//           })
//           describe("fulfillRandomWords", async () => {
//               it("works with chainlink keepers and chainlink vrf, we get a random winner", async () => {
//                   const startingTimeStamp = await raffle.getLastTimeStamp()
//                   accounts = await ethers.getSigners()
//                   await new Promise(async (resolve, reject) => {
//                       raffle.once("Winner Picked", async () => {
//                           console.log("Winner picked!")
//                           try {
//                               const recentWinner = await raffle.getRecentWinner()
//                               const raffleState = await raffle.getRaffleState()
//                               const winnerEndingBalance = await accounts[0].getBalance()
//                               const endingTimestamp = await raffle.getLastTimeStamp()

//                               await expect(raffle.getPlayer(0)).to.be.reverted
//                               assert.equal(recentWinner.toString(), accounts[0].address)
//                               assert.equal(raffleState, 0)
//                               assert.equal(
//                                   winnerEndingBalance.toString,
//                                   winnerStartingBalance.add(raffleEntranceFee).toString()
//                               )
//                               assert(endingTimestamp > startingTimeStamp)
//                               resolve()
//                           } catch (error) {
//                               console.log(error)
//                               reject(e)
//                           }
//                       })
//                       await raffle.enterRaffle({ value: raffleEntranceFee })
//                       const winnerStartingBalance = await accounts[0].getBalance()
//                   })
//               })
//           })
//       })
