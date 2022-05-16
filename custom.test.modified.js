// [assignment] please copy the entire modified custom.test.js here
const hre = require('hardhat')
const { ethers, waffle } = hre
const { loadFixture } = waffle
const { expect } = require('chai')
const { utils } = ethers

const Utxo = require('../src/utxo')
const { transaction, registerAndTransact, prepareTransaction, buildMerkleTree } = require('../src/index')
const { toFixedHex, poseidonHash } = require('../src/utils')
const { Keypair } = require('../src/keypair')
const { encodeDataForBridge } = require('./utils')

const MERKLE_TREE_HEIGHT = 5
const l1ChainId = 1
const MINIMUM_WITHDRAWAL_AMOUNT = utils.parseEther(process.env.MINIMUM_WITHDRAWAL_AMOUNT || '0.05')
const MAXIMUM_DEPOSIT_AMOUNT = utils.parseEther(process.env.MAXIMUM_DEPOSIT_AMOUNT || '1')

describe('Custom Tests', function () {
  this.timeout(20000)

  async function deploy(contractName, ...args) {
    const Factory = await ethers.getContractFactory(contractName)
    const instance = await Factory.deploy(...args)
    return instance.deployed()
  }

  async function fixture() {
    require('../scripts/compileHasher')
    const [sender, gov, l1Unwrapper, multisig] = await ethers.getSigners()
    const verifier2 = await deploy('Verifier2')
    const verifier16 = await deploy('Verifier16')
    const hasher = await deploy('Hasher')

    const token = await deploy('PermittableToken', 'Wrapped ETH', 'WETH', 18, l1ChainId)
    await token.mint(sender.address, utils.parseEther('10000'))

    const amb = await deploy('MockAMB', gov.address, l1ChainId)
    const omniBridge = await deploy('MockOmniBridge', amb.address)

    /** @type {TornadoPool} */
    const tornadoPoolImpl = await deploy(
      'TornadoPool',
      verifier2.address,
      verifier16.address,
      MERKLE_TREE_HEIGHT,
      hasher.address,
      token.address,
      omniBridge.address,
      l1Unwrapper.address,
      gov.address,
      l1ChainId,
      multisig.address,
    )

    const { data } = await tornadoPoolImpl.populateTransaction.initialize(
      MINIMUM_WITHDRAWAL_AMOUNT,
      MAXIMUM_DEPOSIT_AMOUNT,
    )
    const proxy = await deploy(
      'CrossChainUpgradeableProxy',
      tornadoPoolImpl.address,
      gov.address,
      data,
      amb.address,
      l1ChainId,
    )

    const tornadoPool = tornadoPoolImpl.attach(proxy.address)

    await token.approve(tornadoPool.address, utils.parseEther('10000'))

    return { tornadoPool, token, proxy, omniBridge, amb, gov, multisig }
  }

  it('[assignment] ii. deposit 0.1 ETH in L1 -> withdraw 0.08 ETH in L2 -> assert balances', async () => {
      // [assignment] complete code here
      const { tornadoPool, token, omniBridge } = await loadFixture(fixture)
      const aliceKeypair = new Keypair()
      //Alice is depositing 0.1 ether into tornado pool
      const aliceDepositAmount = utils.parseEther('0.1')
      const aliceDepositUtxo = new Utxo({amount: aliceDepositAmount, Keypair: aliceKeypair})
      const { args, extData } = await prepareTransaction ({ tornadoPool, outputs: [aliceDepositUtxo],})
      
      const onTokenBridgedData = encodeDataForBridge({proof: args, extData,})
      
      const onTokenBridgedTx = await tornadoPool.populateTransaction.onTokenBridged(
        token.address,
        aliceDepositUtxo.amount,
        onTokenBridgedData,
      )
      //sends token to omnibridge 
      await token.transfer(omniBridge.address, aliceDepositAmount)
      const transferTx = await token.populateTransaction.transfer(tornadoPool.address, aliceDepositAmount)
      
      await omniBridge.execute([
      { who: token.address, callData: transferTx.data }, // send tokens to pool from omni
      { who: tornadoPool.address, callData: onTokenBridgedTx.data }, // call onTokenBridgedTx
    ])

      //withdraws 0.08 eth from L2
      const aliceWithdrawAmount = utils.parseEther('0.08')
      const recipient = '0xDeaD00000000000000000000000000000000BEEf'
      const aliceChangeUtxo = new Utxo({
        amount: aliceDepositAmount.sub(aliceWithdrawAmount),
        keypair: aliceKeypair,
      })

      await transaction({
        tornadoPool,
        inputs: [aliceDepositUtxo],
        outputs: [aliceChangeUtxo],
        recipient: recipient,
        isL1Withdrawal: false,
      })
      
      const recipientBalance = await token.balanceOf(recipient)
      expect(recipientBalance).to.be.equal(utils.parseEther('0.08'))// ensuring that the recipient has a value of the amount transferred
      const omniBridgeBalance = await token.balanceOf(omniBridge.address)
      expect(omniBridgeBalance).to.be.equal(0)// ensuring that the omni bridge is zero after transferring to th recipients address
      const tornadoPoolBalanceafterwithdraw = await token.balanceOf(tornadoPool.address)
      expect (tornadoPoolBalanceafterwithdraw).to.be.equal(utils.parseEther('0.02')) //ensuing that 0.02 is left in the tornadopoolbalance
  })

  it('[assignment] iii. Alice deposits 0.13eth -> sends Bob 0.6eth -> Bob withdraws , alice withdraws ', async () => {
      // [assignment] complete code here
      const { tornadoPool, token, omniBridge } = await loadFixture(fixture)
      const aliceKeypair = new Keypair()
      //Alice is depositing 0.13 ether into tornado pool
      const aliceDepositAmount = utils.parseEther('0.13')
      const aliceDepositUtxo = new Utxo({amount: aliceDepositAmount, Keypair: aliceKeypair})
      const { args, extData } = await prepareTransaction ({ tornadoPool, outputs: [aliceDepositUtxo],})
      
      const onTokenBridgedData = encodeDataForBridge({proof: args, extData,})
      
      const onTokenBridgedTx = await tornadoPool.populateTransaction.onTokenBridged(
        token.address,
        aliceDepositUtxo.amount,
        onTokenBridgedData,
      )
      //sends token to omnibridge 
      await token.transfer(omniBridge.address, aliceDepositAmount)
      const transferTx = await token.populateTransaction.transfer(tornadoPool.address, aliceDepositAmount)
      
      await omniBridge.execute([
      { who: token.address, callData: transferTx.data }, // send tokens to pool from omni
      { who: tornadoPool.address, callData: onTokenBridgedTx.data }, // call onTokenBridgedTx
    ])

    // Bob gives Alice address to send some eth inside the shielded pool
    const bobKeypair = new Keypair() // contains private and public keys
    const bobAddress = bobKeypair.address() // contains only public key

     // Alice sends some funds to Bob
     const bobSendAmount = utils.parseEther('0.06')
     const bobSendUtxo = new Utxo({ amount: bobSendAmount, keypair: Keypair.fromString(bobAddress) })
     const aliceChangeUtxo = new Utxo({
       amount: aliceDepositAmount.sub(bobSendAmount),
       keypair: aliceDepositUtxo.keypair,
     })
     await transaction({ tornadoPool, inputs: [aliceDepositUtxo], outputs: [bobSendUtxo, aliceChangeUtxo] })
    

    // Bob parses chain to detect incoming funds
    const filter = tornadoPool.filters.NewCommitment()
    const fromBlock = await ethers.provider.getBlock()
    const events = await tornadoPool.queryFilter(filter, fromBlock.number)
    let bobReceiveUtxo
    try {
      bobReceiveUtxo = Utxo.decrypt(bobKeypair, events[0].args.encryptedOutput, events[0].args.index)
    } catch (e) {
      // we try to decrypt another output here because it shuffles outputs before sending to blockchain
      bobReceiveUtxo = Utxo.decrypt(bobKeypair, events[1].args.encryptedOutput, events[1].args.index)
    }
    expect(bobReceiveUtxo.amount).to.be.equal(bobSendAmount)

    // Bob withdraws all of his funds from the shielded pool
    const bobWithdrawAmount = utils.parseEther('0.06')
    const BobEthaddress = '0xDeaD00000000000000000000000000000000BEEf'
    const bobChangeUtxo = new Utxo({ amount: bobSendAmount.sub(bobWithdrawAmount), keypair: bobKeypair })
    
    await transaction({
      tornadoPool,
      inputs: [bobReceiveUtxo],
      outputs: [bobChangeUtxo],
      recipient: BobEthaddress,
      isL1Withdrawal: false,
    })

    //Alice withdraws all her remaining funds
    const aliceWithdrawalAmount = utils.parseEther('0.07')
    const recipient = '0x302085561Ef310B85e9331903F447A660f4f525a'
    const aliceWithdrawalUtxo = new Utxo({
      amount: aliceDepositAmount.sub(bobSendAmount).sub(aliceWithdrawalAmount),
      keypair: aliceKeypair,
    })

    await transaction({
      tornadoPool,
      inputs: [aliceChangeUtxo],
      outputs: [aliceWithdrawalUtxo],
      recipient: recipient,
      isL1Withdrawal: true,
    })

      const recipientAliceBalance = await token.balanceOf(recipient)
      expect(recipientAliceBalance).to.be.equal(0)// after withdrawal
      const recipientBobsBalance = await token.balanceOf(BobEthaddress)
      expect(recipientBobsBalance).to.be.equal(utils.parseEther('0.06'))// ensuring that the recipient has a value of the amount transferred
      const omniBridgeBalance = await token.balanceOf(omniBridge.address)
      expect(omniBridgeBalance).to.be.equal(utils.parseEther('0.07'))// ensuring that the omni bridge remains 0.07 after transferring to th recipients address
      const tornadoPoolBalanceafterwithdraw = await token.balanceOf(tornadoPool.address)
      expect (tornadoPoolBalanceafterwithdraw).to.be.equal(0) //ensuing that 0 is left in the tornadopoolbalance
  })
})
