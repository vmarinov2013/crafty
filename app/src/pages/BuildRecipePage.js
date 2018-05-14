import React from 'react'
import { action, observable, runInAction, when } from 'mobx'
import { observer, inject } from 'mobx-react'
import { Redirect } from 'react-router-dom'
import axios from 'axios'

import Header from '../components/Header'
import Footer from '../components/Footer'
import Subtitle from '../components/Subtitle'
import SectionHeader from '../components/SectionHeader'
import Input from '../components/Input'
import WithWeb3Context from '../components/WithWeb3Context'
import BlockingLoader from '../components/BlockingLoader'
import SectionLoader from '../components/SectionLoader'
import InputTokenField from '../components/InputTokenField'

import RootStore from '../store/RootStore'

import buildRecipeForm from '../forms/BuildRecipe'

import { uid } from '../util'

@inject('store')
@observer
class BuildRecipePage extends React.Component {
  @observable deploying = false
  @observable playing = false
  @observable totallyDone = false
  @observable tokenAddress
  @observable form = null

  constructor (props) {
    super(props)

    this._lazyInitForm()
  }

  _lazyInitForm = async () => {
    const start = Date.now()

    await when(() => !this.props.store.domain.isLoadingCanonicalTokens)
    const finished = Date.now()
    const diff = finished - start // ms

    const minimumDelay = 800
    const timeLeft = minimumDelay - diff
    const restDelay = Math.max(0, timeLeft)

    setTimeout(action(() => {
      this.form = buildRecipeForm(this.props.store.domain.canonicalTokensInfo)

      // add initial input
      this._addInput()
    }), restDelay)
  }

  _canDeploy = () => {
    const crafty = this.props.store.domain.crafty
    if (!crafty) { return false }

    return true
  }

  _addInput = () => {
    this.form.$('inputs').add({ id: uid() })
  }

  @action
  closeLoader = () => {
    this.playing = false
    this.totallyDone = true
  }

  @action
  deploy = async () => {
    if (!this._canDeploy()) { return }
    this.deploying = true

    try {
      const crafty = this.props.store.domain.crafty
      const values = this.form.values()
      const ingredients = values.inputs.map(i => i.address)
      const amounts = values.inputs.map(i => i.amount)

      const tokenMetadataURI = await this.uploadMetadata(values.name, values.description, values.image, RootStore.web3Context.currentAddress)

      const tokenAddress = await crafty.addCraftable(
        values.name,
        values.symbol,
        tokenMetadataURI,
        ingredients,
        amounts
      )
      runInAction(() => {
        this.tokenAddress = tokenAddress
        this.totallyDone = true
      })
    } catch (error) {
      console.error(error)
    } finally {
      runInAction(() => {
        this.deploying = false
      })
    }
  }

  async uploadMetadata(name, description, image, author) {
    const API = RootStore.config.api

    // The image is stored as a base64 string, we remove the preffix to only send the encoded binary file
    const imageResponse = await axios.post(`${API}/thumbnail`, {'image-base64': image.split(/,/)[1]})
    if (imageResponse.status !== 200) {
      throw new Error(`Unexpected API response: ${imageResponse.status}`)
    }

    // The image URL is then stored in the metadata
    const metadataResponse = await axios.post(`${API}/metadata`, {
      'name': name,
      'description': description,
      'image': imageResponse.data,
      'author': author
    })

    if (metadataResponse.status !== 200) {
      throw new Error(`Unexpected API response: ${metadataResponse.status}`)
    }

    return metadataResponse.data
  }

  render () {
    this.form && this.form.validate()
    return (
      <div>
        {this.totallyDone &&
          <Redirect to={`/craft/${this.tokenAddress}`} />
        }
        <BlockingLoader
          title='Deploying your Craftable Token'
          open={this.playing}
          canClose={!this.deploying}
          finishText='Done deploying! You can continue playing or return to the Crafting Game'
          requestClose={this.closeLoader}
        />
        <Header>Build a Craftable Token</Header>
        <Subtitle>
          Here you can <b>create your own craftable token</b>.
          Choose the ingredient ERC20 tokens and then describe your creation.
        </Subtitle>
        <WithWeb3Context read write render={() => (
          <div>
            <SectionHeader>
              <code>01.</code> Describe Your New Craftable Token
            </SectionHeader>

            <SectionLoader
              loading={!this.form}
              render={() =>
                <div>
                  <Input field={this.form.$('image')} />
                  <div className='grid-x grid-margin-x'>
                    <div className='cell small-12 medium-6'>
                      <Input field={this.form.$('name')} />
                    </div>
                    <div className='cell small-12 medium-6'>
                      <Input field={this.form.$('symbol')} />
                    </div>
                  </div>
                  <Input field={this.form.$('description')} />
                </div>
              }
            />

            <SectionHeader>
              <code>02.</code> Ingredient Tokens
            </SectionHeader>

            <SectionLoader
              loading={!this.form}
              render={() =>
                <div>
                  {this.form.$('inputs').map((field, index) =>
                    <InputTokenField
                      key={index}
                      field={field}
                      editing
                    />
                  )}
                  <button
                    className='button'
                    onClick={this._addInput}
                  >
                  + Add Token
                  </button>
                </div>
              }
            />

            <SectionHeader>
              <code>03.</code> Deploy
            </SectionHeader>

            <SectionLoader
              loading={!this.form}
              render={() =>
                <div className='grid-x grid-margin-x align-center'>
                  <div className='cell shrink grid-y align-center'>
                    {!this.form.isValid && this.form.error}
                    <button
                      className='cell button inverted'
                      onClick={this.deploy}
                      disabled={!this.form.isValid || !this._canDeploy()}
                    >
                      Deploy em&#39;
                    </button>
                    {!this._canDeploy() &&
                      <p className='cell help-text'>
                        {'We can\'t find the crafty contract! Are you on the right network?'}
                      </p>
                    }
                  </div>
                </div>
              }
            />
          </div>
        )} />
        <Footer />
      </div>
    )
  }
}

export default BuildRecipePage