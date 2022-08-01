const { assert, expect } = require("chai")
const { network, getNamedAccounts, deployments, ethers } = require("hardhat")
const { developmentChains, networkConfig } = require("../../helper.hardhat.config")

!developmentChains.includes(network.name) //if the network name is not included then skip or else *run the test*
    ? describe.skip
    : describe("Raffle unit test", async () => {
          let raffle, vrfCoordinatorV2Mock, raffleEntranceFee, deployer, interval
          const chainId = network.config.chainId

          beforeEach(async () => {
              deployer = (await getNamedAccounts()).deployer
              await deployments.fixture(["all"])
              raffle = await ethers.getContract("Raffle", deployer) //get the deployed contract and connect it to the deployer
              vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock", deployer)
              raffleEntranceFee = await raffle.getEntranceFee()
              interval = await raffle.getLastTimeStamp()
          })

          describe("constructor", () => {
              it("initializes the raffle correctly", async () => {
                  //ideally we have 1 assert per it
                  const raffleState = await raffle.getRaffleState()
                  const interval = await raffle.getInterval()
                  assert.equal(raffleState.toString(), "0")
                  assert.equal(interval.toString(), networkConfig[chainId]["interval"])
              })
          })
          describe("enterRaffle", () => {
              it("revers when you don't pay enough", async () => {
                  await expect(raffle.enterRaffle()).to.be.revertedWith(
                      "Raffle__NotEnoughEthEntered"
                  )
              })
              it("records players when they enter", async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  const playerFromContract = await raffle.getPlayer(0)
                  assert.equal(playerFromContract, deployer)
              })
              it("emits event on enter", async () => {
                  await expect(raffle.enterRaffle({ value: raffleEntranceFee })).to.emit(
                      raffle,
                      "RaffleEnter"
                  )
              })
              it("reverts if the lottery state is not open", async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.send("evm_mine", [])

                  await raffle.performUpkeep([])
                  await expect(raffle.enterRaffle({ value: raffleEntranceFee })).to.be.revertedWith(
                      "Raffle__NotOpen"
                  )
              })
          })
          describe("checkUpkeep", () => {
              it("returns false if people haven't sent any eth", async () => {
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.send("evm_mine", [])
                  const { upkeepNeeded, xyz } = await raffle.callStatic.checkUpkeep("0x")
                  assert(!upkeepNeeded)
              })

              it("returns false if raffle isn't open", async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.send("evm_mine", [])
                  await raffle.performUpkeep([])
                  const raffleState = await raffle.getRaffleState()
                  const { upkeepNeeded } = await raffle.callStatic.checkUpkeep([])
                  assert.equal(raffleState.toString(), "1")
                  assert.equal(upkeepNeeded, false)
              })
          })
          describe("performUpkeep", () => {
              it("can only run if checkUpkeep is true", async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.request({ method: "evm_mine", params: [] })
                  const tx = await raffle.performUpkeep([])
                  assert(tx)
              })
              it("reverts if checkup is false", async () => {
                  await expect(raffle.performUpkeep("0x")).to.be.revertedWith(
                      "Raffle__UpkeepNotNeeded"
                  )
              })
              it("updates the raffle state and emits a requestId", async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.request({ method: "evm_mine", params: [] })
                  const txResponse = await raffle.performUpkeep("0x") // emits requestId
                  const txReceipt = await txResponse.wait(1) // waits 1 block
                  const raffleState = await raffle.getRaffleState() // updates state
                  const requestId = txReceipt.events[1].args.requestId
                  assert(requestId.toNumber() > 0)
                  assert(raffleState == 1) // 0 = open, 1 = calculating
              })
              describe("fulfillRandomWords", () => {
                  beforeEach(async () => {
                      await raffle.enterRaffle({ value: raffleEntranceFee })
                      await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                      await network.provider.request({ method: "evm_mine", params: [] })
                  })
                  it("can only be called after performUpkeep", async () => {
                      await expect(
                          vrfCoordinatorV2Mock.fulfillRandomWords(1, raffle.address)
                      ).to.be.revertedWith("nonexistent request")
                      await expect(
                          vrfCoordinatorV2Mock.fulfillRandomWords(0, raffle.address)
                      ).to.be.revertedWith("nonexistent request")
                  })
                  it("picks a winner, resets the lottery and sends money", async () => {
                      const additionalEntrants = 3
                      const startingAccountIndex = 1 //deployer is at 0
                      const accounts = await ethers.getSigners() // array of accounts
                      for (
                          let i = startingAccountIndex;
                          i < startingAccountIndex + additionalEntrants;
                          i++
                      ) {
                          const accountConnectedRaffle = raffle.connect(accounts[i])
                          await accountConnectedRaffle.enterRaffle({ value: raffleEntranceFee })
                          //connecting 3 additional players to the raffle on top of deployer, meaning 4 players in total
                      }
                      const startingTimeStamp = await raffle.getLastTimeStamp()

                      //performUpkeep (mock being chainlink keeper)
                      //fulfillRandomWords (mock being chainlink VRF)
                      //wait for fulfillRandomWords to be called

                      await new Promise(async (resolve, reject) => {
                          raffle.once("WinnerPicked", async () => {
                              // event listener for WinnerPicked
                              console.log("WinnerPicked event fired!")
                              // assert throws an error if it fails, so we need to wrap
                              // it in a try/catch so that the promise returns event
                              // if it fails.
                              try {
                                  console.log(accounts[0].address)
                                  console.log(accounts[1].address)
                                  console.log(accounts[2].address)
                                  console.log(accounts[3].address)
                                  // Now lets get the ending values...
                                  const recentWinner = await raffle.getRecentWinner()
                                  console.log(recentWinner)
                                  const raffleState = await raffle.getRaffleState()
                                  const winnerBalance = await accounts[1].getBalance()
                                  const endingTimeStamp = await raffle.getLastTimeStamp()
                                  await expect(raffle.getPlayer(0)).to.be.reverted
                                  // Comparisons to check if our ending values are correct:
                                  assert.equal(recentWinner.toString(), accounts[1].address)
                                  assert.equal(raffleState, 0)
                                  assert.equal(
                                      winnerBalance.toString(),
                                      startingBalance // startingBalance + ( (raffleEntranceFee * additionalEntrances) + raffleEntranceFee )
                                          .add(
                                              raffleEntranceFee
                                                  .mul(additionalEntrants)
                                                  .add(raffleEntranceFee)
                                          )
                                          .toString()
                                  )
                                  assert(endingTimeStamp > startingTimeStamp)
                                  resolve() // if try passes, resolves the promise
                              } catch (e) {
                                  reject(e) // if try fails, rejects the promise
                              }
                          })

                          const tx = await raffle.performUpkeep("0x")
                          const txReceipt = await tx.wait(1)
                          const startingBalance = await accounts[2].getBalance()
                          await vrfCoordinatorV2Mock.fulfillRandomWords(
                              txReceipt.events[1].args.requestId,
                              raffle.address
                          )
                      })
                  })
              })
          })
      })

//     it("returns false if enough time hasn't passed", async () => {
//     await raffle.enterRaffle({ value: raffleEntranceFee })
//     await network.provider.send("evm_increaseTime", [interval.toNumber() - 1])
//     await network.provider.request({ method: "evm_mine", params: [] })
//     const { upkeepNeeded } = await raffle.callStatic.checkUpkeep("0x") // upkeepNeeded = (timePassed && isOpen && hasBalance && hasPlayers)
//     assert(!upkeepNeeded)
//    })

// await new Promise(async (resolve, reject) => {
//     raffle.once("Winner Picked", async () => {
//         console.log("Found the event!")
//         try {
//             console.log(accounts[0].address)
//             console.log(accounts[1].address)
//             console.log(accounts[2].address)
//             console.log(accounts[3].address)
//             const recentWinner = await raffle.getRecentWinner()
//             console.log(recentWinner)

//             const raffleState = await raffle.getRaffleState()
//             const endingTimestamp = await raffle.getLastTimeStamp()
//             const numPlayers = await raffle.getNumberOfPlayers()
//             assert.equal(numPlayers.toString(), "0")
//             assert.equal(raffleState.toString(), "0")
//             assert(endingTimestamp > startingTimeStamp)
//             resolve()
//         } catch (e) {
//             reject(e)
//         }
//     })
//     //setting up the listener
//     //the code below will fire the event, listener will pick it up and resolve
//     const tx = await raffle.performUpkeep([])
//     const txReceipt = await tx.wait(1)
//     await vrfCoordinatorV2Mock.fulfillRandomWords(
//         txReceipt.events[1].args.requestId,
//         raffle.address
