import { Renderer } from '../src/Renderer.js';
import * as utils from '../src/utils.js';
import { registerBidder, getIabSubCategory } from '../src/adapters/bidderFactory.js';
import { BANNER, NATIVE, VIDEO, ADPOD } from '../src/mediaTypes.js';
import find from 'core-js-pure/features/array/find.js';
import includes from 'core-js-pure/features/array/includes.js';
import { INSTREAM, OUTSTREAM } from '../src/video.js'
import { config } from '../src/config.js';
import { getStorageManager } from '../src/storageManager.js';

const BIDDER_CODE = 'districtmDMX';
const URL = '//ib.adnxs.com/ut/v3/prebid';
const DMXURI = 'https://dmx.districtm.io/b/v1';
const ANX_SEAT = '1908';
const mappingFileUrl = 'https://acdn.adnxs.com/prebid/appnexus-mapping/mappings.json';
const VIDEO_TARGETING = ['id', 'mimes', 'minduration', 'maxduration', 'startdelay', 'skippable', 'playback_method', 'frameworks'];
const USER_PARAMS = ['age', 'external_uid', 'segments', 'gender', 'dnt', 'language'];
const MAX_IMPS_PER_REQUEST = 15;
const APP_DEVICE_PARAMS = ['geo', 'device_id']; // appid is collected separately
const DEBUG_PARAMS = ['enabled', 'dongle', 'member_id', 'debug_timeout'];
const GVLID = 32;
const NATIVE_MAPPING = {
  body: 'description',
  cta: 'ctatext',
  image: {
    serverName: 'main_image',
    requiredParams: { required: true },
    minimumParams: { sizes: [{}] },
  },
  icon: {
    serverName: 'icon',
    requiredParams: { required: true },
    minimumParams: { sizes: [{}] },
  },
  sponsoredBy: 'sponsored_by',
};
const SOURCE = 'pbjs';
const storage = getStorageManager(GVLID, BIDDER_CODE);
const VIDEO_MAPPING = {
  playback_method: {
    'auto_play_sound_on': 1,
    'auto_play_sound_off': 2,
    'click_to_play': 3,
    'mouse_over': 4,
    'viewport_sound_on': 5,
    'viewport_sound_off': 6
  }
};
export const spec = {
  code: BIDDER_CODE,
  supportedMediaTypes: ['banner', 'video'],
  isBidRequestValid(bid) {
    return !!(bid.params.dmxid && bid.params.memberid);
  },
  getMappingFileInfo: function () {
    return {
      url: mappingFileUrl,
      refreshInDays: 2
    }
  },
  test() {
    return window.location.href.indexOf('dmTest=true') !== -1 ? 1 : 0;
  },
  buildRequests(bidRequest, bidderRequest) {
    if (cleanMediaTypeVideo(bidRequest).length > 0) {
      return [
        returnADNXS(bidRequest, bidderRequest),
        returnDMX(bidRequest, bidderRequest)
      ];
    } else {
      return [
        returnADNXS(bidRequest, bidderRequest),
        returnDMX(bidRequest, bidderRequest)
      ]
    }
  },
  interpretResponse(serverResponse, bidRequest) {
    serverResponse = serverResponse && serverResponse.body ? serverResponse.body : null;
    const bids = [];
    if (serverResponse) {
      if (serverResponse.tags) {
        return responseADNXS(serverResponse, bidRequest);
      } else if (serverResponse.seatbid) {
        return responseDMX(serverResponse, bidRequest);
      } else {
        return bids;
      }
    } else {
      return bids;
    }
  },
  transformBidParams(params, isOpenRtb) {
    params = utils.convertTypes({
      'member': 'string',
      'invCode': 'string',
      'placementId': 'number',
      'keywords': utils.transformBidderParamKeywords
    }, params);

    if (isOpenRtb) {
      params.use_pmt_rule = (typeof params.usePaymentRule === 'boolean') ? params.usePaymentRule : false;
      if (params.usePaymentRule) {
        delete params.usePaymentRule;
      }
      Object.keys(params).forEach(paramKey => {
        let convertedKey = utils.convertCamelToUnderscore(paramKey);
        if (convertedKey !== paramKey) {
          params[convertedKey] = params[paramKey];
          delete params[paramKey];
        }
      });
    }

    return params;
  },
  getUserSyncs(optionsType) {
    if (optionsType.iframeEnabled) {
      return [
        {
          type: 'iframe',
          url: 'https://cdn.districtm.io/ids/index.html'
        },
        {
          type: 'iframe',
          url: '//acdn.adnxs.com/ib/static/usersync/v3/async_usersync.html'
        }
      ]
    }
  }

}

function cleanMediaTypeVideo(bids) {
  const nBids = bids.filter(bid => {
    if (typeof bid.mediaTypes === 'undefined') {
      return true;
    }
    if (typeof bid.mediaTypes.video === 'undefined') {
      return true;
    }
    return false;
  })
  return nBids
}

/**
 * Unpack the Server's Bid into a Prebid-compatible one.
 * @param serverBid
 * @param rtbBid
 * @param bidderRequest
 * @return Bid
 */
function newBid(serverBid, rtbBid, bidderRequest) {
  const bidRequest = utils.getBidRequest(serverBid.uuid, [bidderRequest]);
  const bid = {
    requestId: serverBid.uuid,
    cpm: rtbBid.cpm,
    creativeId: rtbBid.creative_id,
    dealId: rtbBid.deal_id,
    currency: 'USD',
    netRevenue: true,
    ttl: 300,
    adUnitCode: bidRequest.adUnitCode,
    appnexus: {
      buyerMemberId: rtbBid.buyer_member_id,
      dealPriority: rtbBid.deal_priority,
      dealCode: rtbBid.deal_code
    }
  };

  if (rtbBid.advertiser_id) {
    bid.meta = Object.assign({}, bid.meta, { advertiserId: rtbBid.advertiser_id });
  }

  if (rtbBid.rtb.video) {
    // shared video properties used for all 3 contexts
    Object.assign(bid, {
      width: rtbBid.rtb.video.player_width,
      height: rtbBid.rtb.video.player_height,
      vastImpUrl: rtbBid.notify_url,
      ttl: 3600
    });

    const videoContext = utils.deepAccess(bidRequest, 'mediaTypes.video.context');
    switch (videoContext) {
      case ADPOD:
        const primaryCatId = getIabSubCategory(bidRequest.bidder, rtbBid.brand_category_id);
        bid.meta = Object.assign({}, bid.meta, { primaryCatId });
        const dealTier = rtbBid.deal_priority;
        bid.video = {
          context: ADPOD,
          durationSeconds: Math.floor(rtbBid.rtb.video.duration_ms / 1000),
          dealTier
        };
        bid.vastUrl = rtbBid.rtb.video.asset_url;
        break;
      case OUTSTREAM:
        bid.adResponse = serverBid;
        bid.adResponse.ad = bid.adResponse.ads[0];
        bid.adResponse.ad.video = bid.adResponse.ad.rtb.video;
        bid.vastXml = rtbBid.rtb.video.content;

        if (rtbBid.renderer_url) {
          const videoBid = find(bidderRequest.bids, bid => bid.bidId === serverBid.uuid);
          const rendererOptions = utils.deepAccess(videoBid, 'renderer.options');
          bid.renderer = newRenderer(bid.adUnitCode, rtbBid, rendererOptions);
        }
        break;
      case INSTREAM:
        bid.vastUrl = rtbBid.notify_url + '&redir=' + encodeURIComponent(rtbBid.rtb.video.asset_url);
        break;
    }
  } else if (rtbBid.rtb[NATIVE]) {
    const nativeAd = rtbBid.rtb[NATIVE];

    // setting up the jsTracker:
    // we put it as a data-src attribute so that the tracker isn't called
    // until we have the adId (see onBidWon)
    let jsTrackerDisarmed = rtbBid.viewability.config.replace('src=', 'data-src=');

    let jsTrackers = nativeAd.javascript_trackers;

    if (jsTrackers == undefined) {
      jsTrackers = jsTrackerDisarmed;
    } else if (utils.isStr(jsTrackers)) {
      jsTrackers = [jsTrackers, jsTrackerDisarmed];
    } else {
      jsTrackers.push(jsTrackerDisarmed);
    }

    bid[NATIVE] = {
      title: nativeAd.title,
      body: nativeAd.desc,
      body2: nativeAd.desc2,
      cta: nativeAd.ctatext,
      rating: nativeAd.rating,
      sponsoredBy: nativeAd.sponsored,
      privacyLink: nativeAd.privacy_link,
      address: nativeAd.address,
      downloads: nativeAd.downloads,
      likes: nativeAd.likes,
      phone: nativeAd.phone,
      price: nativeAd.price,
      salePrice: nativeAd.saleprice,
      clickUrl: nativeAd.link.url,
      displayUrl: nativeAd.displayurl,
      clickTrackers: nativeAd.link.click_trackers,
      impressionTrackers: nativeAd.impression_trackers,
      javascriptTrackers: jsTrackers
    };
    if (nativeAd.main_img) {
      bid['native'].image = {
        url: nativeAd.main_img.url,
        height: nativeAd.main_img.height,
        width: nativeAd.main_img.width,
      };
    }
    if (nativeAd.icon) {
      bid['native'].icon = {
        url: nativeAd.icon.url,
        height: nativeAd.icon.height,
        width: nativeAd.icon.width,
      };
    }
  } else {
    Object.assign(bid, {
      width: rtbBid.rtb.banner.width,
      height: rtbBid.rtb.banner.height,
      ad: rtbBid.rtb.banner.content
    });
    try {
      if (rtbBid.rtb.trackers) {
        const url = rtbBid.rtb.trackers[0].impression_urls[0];
        const tracker = utils.createTrackPixelHtml(url);
        bid.ad += tracker;
      }
    } catch (error) {
      utils.logError('Error appending tracking pixel', error);
    }
  }

  return bid;
}

function bidToTag(bid) {
  const tag = {};
  tag.sizes = transformSizes(bid.sizes);
  tag.primary_size = tag.sizes[0];
  tag.ad_types = [];
  tag.uuid = bid.bidId;
  bid.params.member = ANX_SEAT;
  bid.params.invCode = `dm-pl-${bid.params.dmxid}`;
  if (bid.params.placementId) {
    tag.id = parseInt(bid.params.placementId, 10);
  } else {
    tag.code = bid.params.invCode;
  }
  tag.allow_smaller_sizes = bid.params.allowSmallerSizes || false;
  tag.use_pmt_rule = bid.params.usePaymentRule || false
  tag.prebid = true;
  tag.disable_psa = true;
  if (bid.params.reserve) {
    tag.reserve = bid.params.reserve;
  }
  if (bid.params.position) {
    tag.position = {'above': 1, 'below': 2}[bid.params.position] || 0;
  }
  if (bid.params.trafficSourceCode) {
    tag.traffic_source_code = bid.params.trafficSourceCode;
  }
  if (bid.params.privateSizes) {
    tag.private_sizes = transformSizes(bid.params.privateSizes);
  }
  if (bid.params.supplyType) {
    tag.supply_type = bid.params.supplyType;
  }
  if (bid.params.pubClick) {
    tag.pubclick = bid.params.pubClick;
  }
  if (bid.params.extInvCode) {
    tag.ext_inv_code = bid.params.extInvCode;
  }
  if (bid.params.externalImpId) {
    tag.external_imp_id = bid.params.externalImpId;
  }
  if (!utils.isEmpty(bid.params.keywords)) {
    tag.keywords = utils.transformBidderParamKeywords(bid.params.keywords);
  }

  if (bid.mediaType === NATIVE || utils.deepAccess(bid, `mediaTypes.${NATIVE}`)) {
    tag.ad_types.push(NATIVE);

    if (bid.nativeParams) {
      const nativeRequest = buildNativeRequest(bid.nativeParams);
      tag[NATIVE] = {layouts: [nativeRequest]};
    }
  }

  const videoMediaType = utils.deepAccess(bid, `mediaTypes.${VIDEO}`);
  const context = utils.deepAccess(bid, 'mediaTypes.video.context');

  if (bid.mediaType === VIDEO || videoMediaType) {
    tag.ad_types.push(VIDEO);
  }

  // instream gets vastUrl, outstream gets vastXml
  if (bid.mediaType === VIDEO || (videoMediaType && context !== 'outstream')) {
    tag.require_asset_url = true;
  }

  if (bid.params.video) {
    tag.video = {};
    // place any valid video params on the tag
    Object.keys(bid.params.video)
      .filter(param => includes(VIDEO_TARGETING, param))
      .forEach(param => {
        switch (param) {
          case 'context':
          case 'playback_method':
            let type = bid.params.video[param];
            type = (utils.isArray(type)) ? type[0] : type;
            tag.video[param] = VIDEO_MAPPING[param][type];
            break;
          default:
            tag.video[param] = bid.params.video[param];
        }
      });
  }

  if (
    (utils.isEmpty(bid.mediaType) && utils.isEmpty(bid.mediaTypes)) ||
    (bid.mediaType === BANNER || (bid.mediaTypes && bid.mediaTypes[BANNER]))
  ) {
    tag.ad_types.push(BANNER);
  }

  return tag;
}

/* Turn bid request sizes into ut-compatible format */
function transformSizes(requestSizes) {
  let sizes = [];
  let sizeObj = {};

  if (utils.isArray(requestSizes) && requestSizes.length === 2 &&
    !utils.isArray(requestSizes[0])) {
    sizeObj.width = parseInt(requestSizes[0], 10);
    sizeObj.height = parseInt(requestSizes[1], 10);
    sizes.push(sizeObj);
  } else if (typeof requestSizes === 'object') {
    for (let i = 0; i < requestSizes.length; i++) {
      let size = requestSizes[i];
      sizeObj = {};
      sizeObj.width = parseInt(size[0], 10);
      sizeObj.height = parseInt(size[1], 10);
      sizes.push(sizeObj);
    }
  }

  return sizes;
}

function hasUserInfo(bid) {
  return !!bid.params.user;
}

function hasMemberId(bid) {
  return !!parseInt(bid.params.member, 10);
}

function hasAppDeviceInfo(bid) {
  if (bid.params) {
    return !!bid.params.app
  }
}

function hasAppId(bid) {
  if (bid.params && bid.params.app) {
    return !!bid.params.app.id
  }
  return !!bid.params.app
}

function hasDebug(bid) {
  return !!bid.debug
}

function hasAdPod(bid) {
  return (
    bid.mediaTypes &&
    bid.mediaTypes.video &&
    bid.mediaTypes.video.context === ADPOD
  );
}

function getRtbBid(tag) {
  return tag && tag.ads && tag.ads.length && find(tag.ads, ad => ad.rtb);
}

function createAdPodRequest(tags, adPodBid) {
  const { durationRangeSec, requireExactDuration } = adPodBid.mediaTypes.video;

  const numberOfPlacements = getAdPodPlacementNumber(adPodBid.mediaTypes.video);
  const maxDuration = utils.getMaxValueFromArray(durationRangeSec);

  const tagToDuplicate = tags.filter(tag => tag.uuid === adPodBid.bidId);
  let request = utils.fill(...tagToDuplicate, numberOfPlacements);

  if (requireExactDuration) {
    const divider = Math.ceil(numberOfPlacements / durationRangeSec.length);
    const chunked = utils.chunk(request, divider);

    // each configured duration is set as min/maxduration for a subset of requests
    durationRangeSec.forEach((duration, index) => {
      chunked[index].map(tag => {
        setVideoProperty(tag, 'minduration', duration);
        setVideoProperty(tag, 'maxduration', duration);
      });
    });
  } else {
    // all maxdurations should be the same
    request.map(tag => setVideoProperty(tag, 'maxduration', maxDuration));
  }

  return request;
}

function getAdPodPlacementNumber(videoParams) {
  const { adPodDurationSec, durationRangeSec, requireExactDuration } = videoParams;
  const minAllowedDuration = utils.getMinValueFromArray(durationRangeSec);
  const numberOfPlacements = Math.floor(adPodDurationSec / minAllowedDuration);

  return requireExactDuration
    ? Math.max(numberOfPlacements, durationRangeSec.length)
    : numberOfPlacements;
}

function setVideoProperty(tag, key, value) {
  if (utils.isEmpty(tag.video)) { tag.video = {}; }
  tag.video[key] = value;
}

function buildNativeRequest(params) {
  const request = {};

  // map standard prebid native asset identifier to /ut parameters
  // e.g., tag specifies `body` but /ut only knows `description`.
  // mapping may be in form {tag: '<server name>'} or
  // {tag: {serverName: '<server name>', requiredParams: {...}}}
  Object.keys(params).forEach(key => {
    // check if one of the <server name> forms is used, otherwise
    // a mapping wasn't specified so pass the key straight through
    const requestKey =
      (NATIVE_MAPPING[key] && NATIVE_MAPPING[key].serverName) ||
      NATIVE_MAPPING[key] ||
      key;

    // required params are always passed on request
    const requiredParams = NATIVE_MAPPING[key] && NATIVE_MAPPING[key].requiredParams;
    request[requestKey] = Object.assign({}, requiredParams, params[key]);

    // minimum params are passed if no non-required params given on adunit
    const minimumParams = NATIVE_MAPPING[key] && NATIVE_MAPPING[key].minimumParams;

    if (requiredParams && minimumParams) {
      // subtract required keys from adunit keys
      const adunitKeys = Object.keys(params[key]);
      const requiredKeys = Object.keys(requiredParams);
      const remaining = adunitKeys.filter(key => !includes(requiredKeys, key));

      // if none are left over, the minimum params needs to be sent
      if (remaining.length === 0) {
        request[requestKey] = Object.assign({}, request[requestKey], minimumParams);
      }
    }
  });

  return request;
}

function hidedfpContainer(elementId) {
  var el = document.getElementById(elementId).querySelectorAll("div[id^='google_ads']");
  if (el[0]) {
    el[0].style.setProperty('display', 'none');
  }
}

function outstreamRender(bid) {
  // push to render queue because ANOutstreamVideo may not be loaded yet
  hidedfpContainer(bid.adUnitCode);
  bid.renderer.push(() => {
    window.ANOutstreamVideo.renderAd({
      tagId: bid.adResponse.tag_id,
      sizes: [bid.getSize().split('x')],
      targetId: bid.adUnitCode, // target div id to render video
      uuid: bid.adResponse.uuid,
      adResponse: bid.adResponse,
      rendererOptions: bid.renderer.getConfig()
    }, handleOutstreamRendererEvents.bind(null, bid));
  });
}

function handleOutstreamRendererEvents(bid, id, eventName) {
  bid.renderer.handleVideoEvent({ id, eventName });
}

function parseMediaType(rtbBid) {
  const adType = rtbBid.ad_type;
  if (adType === VIDEO) {
    return VIDEO;
  } else if (adType === NATIVE) {
    return NATIVE;
  } else {
    return BANNER;
  }
}

function hasPurpose1Consent(bidderRequest) {
  let result = true;
  if (bidderRequest && bidderRequest.gdprConsent) {
    if (bidderRequest.gdprConsent.gdprApplies && bidderRequest.gdprConsent.apiVersion === 2) {
      result = !!(utils.deepAccess(bidderRequest.gdprConsent, 'vendorData.purpose.consents.1') === true);
    }
  }
  return result;
}

function formatRequest(payload, bidderRequest) {
  let request = [];
  let options = {};
  if (!hasPurpose1Consent(bidderRequest)) {
    options = {
      withCredentials: false
    }
  }

  if (payload.tags.length > MAX_IMPS_PER_REQUEST) {
    const clonedPayload = utils.deepClone(payload);

    utils.chunk(payload.tags, MAX_IMPS_PER_REQUEST).forEach(tags => {
      clonedPayload.tags = tags;
      const payloadString = JSON.stringify(clonedPayload);
      request.push({
        method: 'POST',
        url: URL,
        data: payloadString,
        bidderRequest,
        options
      });
    });
  } else {
    const payloadString = JSON.stringify(payload);
    request = {
      method: 'POST',
      url: URL,
      data: payloadString,
      bidderRequest,
      options
    };
  }

  return request;
}

function newRenderer(adUnitCode, rtbBid, rendererOptions = {}) {
  const renderer = Renderer.install({
    id: rtbBid.renderer_id,
    url: rtbBid.renderer_url,
    config: rendererOptions,
    loaded: false,
    adUnitCode
  });

  try {
    renderer.setRender(outstreamRender);
  } catch (err) {
    utils.logWarn('Prebid Error calling setRender on renderer', err);
  }

  renderer.setEventHandlers({
    impression: () => utils.logMessage('AppNexus outstream video impression event'),
    loaded: () => utils.logMessage('AppNexus outstream video loaded event'),
    ended: () => {
      utils.logMessage('AppNexus outstream renderer video event');
      document.querySelector(`#${adUnitCode}`).style.display = 'none';
    }
  });
  return renderer;
}

function returnDMX(bidRequest, bidderRequest) {
  let timeout = config.getConfig('bidderTimeout');
  let schain = null;
  let dmxRequest = {
    id: utils.generateUUID(),
    cur: ['USD'],
    tmax: (timeout - 300),
    test: 0,
    site: {
      publisher: { id: String(bidRequest[0].params.memberid) || null }
    }
  }

  try {
    let params = config.getConfig('dmx');
    dmxRequest.user = params.user || {};
    let site = params.site || {};
    dmxRequest.site = {...dmxRequest.site, ...site}
  } catch (e) {

  }

  let eids = [];
  if (bidRequest[0] && bidRequest[0].userId) {
    bindUserId(eids, utils.deepAccess(bidRequest[0], `userId.idl_env`), 'liveramp.com', 1);
    bindUserId(eids, utils.deepAccess(bidRequest[0], `userId.id5id`), 'id5-sync.com', 1);
    bindUserId(eids, utils.deepAccess(bidRequest[0], `userId.pubcid`), 'pubcid.org', 1);
    bindUserId(eids, utils.deepAccess(bidRequest[0], `userId.tdid`), 'adserver.org', 1);
    bindUserId(eids, utils.deepAccess(bidRequest[0], `userId.criteoId`), 'criteo.com', 1);
    bindUserId(eids, utils.deepAccess(bidRequest[0], `userId.britepoolid`), 'britepool.com', 1);
    bindUserId(eids, utils.deepAccess(bidRequest[0], `userId.lipb.lipbid`), 'liveintent.com', 1);
    bindUserId(eids, utils.deepAccess(bidRequest[0], `userId.intentiqid`), 'intentiq.com', 1);
    bindUserId(eids, utils.deepAccess(bidRequest[0], `userId.lotamePanoramaId`), 'lotame.com', 1);
    bindUserId(eids, utils.deepAccess(bidRequest[0], `userId.parrableId`), 'parrable.com', 1);
    bindUserId(eids, utils.deepAccess(bidRequest[0], `userId.netId`), 'netid.de', 1);
    bindUserId(eids, utils.deepAccess(bidRequest[0], `userId.sharedid`), 'sharedid.org', 1);
    dmxRequest.user = dmxRequest.user || {};
    dmxRequest.user.ext = dmxRequest.user.ext || {};
    dmxRequest.user.ext.eids = eids;
  }
  if (!dmxRequest.test) {
    delete dmxRequest.test;
  }
  if (bidderRequest.gdprConsent) {
    dmxRequest.regs = {};
    dmxRequest.regs.ext = {};
    dmxRequest.regs.ext.gdpr = bidderRequest.gdprConsent.gdprApplies === true ? 1 : 0;
    dmxRequest.user = {};
    dmxRequest.user.ext = {};
    dmxRequest.user.ext.consent = bidderRequest.gdprConsent.consentString;
  }
  dmxRequest.regs = dmxRequest.regs || {};
  dmxRequest.regs.coppa = config.getConfig('coppa') === true ? 1 : 0;
  if (bidderRequest && bidderRequest.uspConsent) {
    dmxRequest.regs = dmxRequest.regs || {};
    dmxRequest.regs.ext = dmxRequest.regs.ext || {};
    dmxRequest.regs.ext.us_privacy = bidderRequest.uspConsent;
  }
  try {
    schain = bidRequest[0].schain;
    dmxRequest.source = {};
    dmxRequest.source.ext = {};
    dmxRequest.source.ext.schain = schain || {}
  } catch (e) {}
  let tosendtags = bidRequest.map(dmx => {
    var obj = {};
    obj.id = dmx.bidId;
    obj.tagid = String(dmx.params.dmxid);
    obj.secure = 1;
    obj.bidfloor = getFloor(dmx);
    if (dmx.mediaTypes && dmx.mediaTypes.video) {
      obj.video = {
        topframe: 1,
        skip: dmx.mediaTypes.video.skippable || 0,
        linearity: dmx.mediaTypes.video.linearity || 1,
        minduration: dmx.mediaTypes.video.minduration || 5,
        maxduration: dmx.mediaTypes.video.maxduration || 60,
        playbackmethod: getPlaybackmethod(dmx.mediaTypes.video.playback_method),
        api: getApi(dmx.mediaTypes.video),
        mimes: dmx.mediaTypes.video.mimes || ['video/mp4'],
        protocols: getProtocols(dmx.mediaTypes.video),
        w: dmx.mediaTypes.video.playerSize[0][0],
        h: dmx.mediaTypes.video.playerSize[0][1],
        format: dmx.mediaTypes.video.playerSize.map(s => {
          return {w: s[0], h: s[1]};
        }).filter(obj => typeof obj.w === 'number' && typeof obj.h === 'number')
      };
    } else {
      obj.banner = {
        topframe: 1,
        w: cleanSizes(dmx.sizes, 'w'),
        h: cleanSizes(dmx.sizes, 'h'),
        format: cleanSizes(dmx.sizes).map(s => {
          return {w: s[0], h: s[1]};
        }).filter(obj => typeof obj.w === 'number' && typeof obj.h === 'number')
      };
    }
    return obj;
  });

  if (tosendtags.length <= 5) {
    dmxRequest.imp = tosendtags;
    return {
      method: 'POST',
      url: DMXURI,
      data: JSON.stringify(dmxRequest),
      bidderRequest
    }
  } else {
    return upto5(tosendtags, dmxRequest, bidderRequest, DMXURI);
  }
}

function returnADNXS(bidRequests, bidderRequest) {
  const tags = bidRequests.map(bidToTag);
  const userObjBid = find(bidRequests, hasUserInfo);
  let userObj = {};
  if (config.getConfig('coppa') === true) {
    userObj = { 'coppa': true };
  }
  if (userObjBid) {
    Object.keys(userObjBid.params.user)
      .filter(param => includes(USER_PARAMS, param))
      .forEach((param) => {
        let uparam = utils.convertCamelToUnderscore(param);
        userObj[uparam] = userObjBid.params.user[param]
      });
  }

  const appDeviceObjBid = find(bidRequests, hasAppDeviceInfo);
  let appDeviceObj;
  if (appDeviceObjBid && appDeviceObjBid.params && appDeviceObjBid.params.app) {
    appDeviceObj = {};
    Object.keys(appDeviceObjBid.params.app)
      .filter(param => includes(APP_DEVICE_PARAMS, param))
      .forEach(param => appDeviceObj[param] = appDeviceObjBid.params.app[param]);
  }

  const appIdObjBid = find(bidRequests, hasAppId);
  let appIdObj;
  if (appIdObjBid && appIdObjBid.params && appDeviceObjBid.params.app && appDeviceObjBid.params.app.id) {
    appIdObj = {
      appid: appIdObjBid.params.app.id
    };
  }

  let debugObj = {};
  let debugObjParams = {};
  const debugCookieName = 'apn_prebid_debug';
  const debugCookie = storage.getCookie(debugCookieName) || null;

  if (debugCookie) {
    try {
      debugObj = JSON.parse(debugCookie);
    } catch (e) {
      utils.logError('AppNexus Debug Auction Cookie Error:\n\n' + e);
    }
  } else {
    const debugBidRequest = find(bidRequests, hasDebug);
    if (debugBidRequest && debugBidRequest.debug) {
      debugObj = debugBidRequest.debug;
    }
  }

  if (debugObj && debugObj.enabled) {
    Object.keys(debugObj)
      .filter(param => includes(DEBUG_PARAMS, param))
      .forEach(param => {
        debugObjParams[param] = debugObj[param];
      });
  }

  const memberIdBid = find(bidRequests, hasMemberId);
  const member = memberIdBid ? parseInt(memberIdBid.params.member, 10) : 0;
  const schain = bidRequests[0].schain;

  const payload = {
    tags: [...tags],
    user: userObj,
    sdk: {
      source: SOURCE,
      version: '$prebid.version$'
    },
    schain: schain
  };

  if (member > 0) {
    payload.member_id = member;
  }

  if (appDeviceObjBid) {
    payload.device = appDeviceObj
  }
  if (appIdObjBid) {
    payload.app = appIdObj;
  }

  if (config.getConfig('adpod.brandCategoryExclusion')) {
    payload.brand_category_uniqueness = true;
  }

  if (debugObjParams.enabled) {
    payload.debug = debugObjParams;
    utils.logInfo('AppNexus Debug Auction Settings:\n\n' + JSON.stringify(debugObjParams, null, 4));
  }

  if (bidderRequest && bidderRequest.gdprConsent) {
    // note - objects for impbus use underscore instead of camelCase
    payload.gdpr_consent = {
      consent_string: bidderRequest.gdprConsent.consentString,
      consent_required: bidderRequest.gdprConsent.gdprApplies
    };
  }

  if (bidderRequest && bidderRequest.uspConsent) {
    payload.us_privacy = bidderRequest.uspConsent
  }

  if (bidderRequest && bidderRequest.refererInfo) {
    let refererinfo = {
      rd_ref: encodeURIComponent(bidderRequest.refererInfo.referer),
      rd_top: bidderRequest.refererInfo.reachedTop,
      rd_ifs: bidderRequest.refererInfo.numIframes,
      rd_stk: bidderRequest.refererInfo.stack.map((url) => encodeURIComponent(url)).join(',')
    }
    payload.referrer_detection = refererinfo;
  }

  const hasAdPodBid = find(bidRequests, hasAdPod);
  if (hasAdPodBid) {
    bidRequests.filter(hasAdPod).forEach(adPodBid => {
      const adPodTags = createAdPodRequest(tags, adPodBid);
      // don't need the original adpod placement because it's in adPodTags
      const nonPodTags = payload.tags.filter(tag => tag.uuid !== adPodBid.bidId);
      payload.tags = [...nonPodTags, ...adPodTags];
    });
  }

  let eids = [];
  const criteoId = utils.deepAccess(bidRequests[0], `userId.criteoId`);
  if (criteoId) {
    eids.push({
      source: 'criteo.com',
      id: criteoId
    });
  }

  const tdid = utils.deepAccess(bidRequests[0], `userId.tdid`);
  if (tdid) {
    eids.push({
      source: 'adserver.org',
      id: tdid,
      rti_partner: 'TDID'
    });
  }

  if (eids.length) {
    payload.eids = eids;
  }

  if (tags[0].publisher_id) {
    payload.publisher_id = tags[0].publisher_id;
  }

  const request = formatRequest(payload, bidderRequest);
  return request;
}

function responseADNXS(serverResponse, {bidderRequest}) {
  serverResponse = serverResponse.body;
  const bids = [];
  if (!serverResponse || serverResponse.error) {
    let errorMessage = `in response for ${bidderRequest.bidderCode} adapter`;
    if (serverResponse && serverResponse.error) { errorMessage += `: ${serverResponse.error}`; }
    utils.logError(errorMessage);
    return bids;
  }

  if (serverResponse.tags) {
    serverResponse.tags.forEach(serverBid => {
      const rtbBid = getRtbBid(serverBid);
      if (rtbBid) {
        if (rtbBid.cpm !== 0 && includes(this.supportedMediaTypes, rtbBid.ad_type)) {
          const bid = newBid(serverBid, rtbBid, bidderRequest);
          bid.mediaType = parseMediaType(rtbBid);
          bids.push(bid);
        }
      }
    });
  }

  if (serverResponse.debug && serverResponse.debug.debug_info) {
    let debugHeader = 'AppNexus Debug Auction for Prebid\n\n'
    let debugText = debugHeader + serverResponse.debug.debug_info
    debugText = debugText
      .replace(/(<td>|<th>)/gm, '\t') // Tables
      .replace(/(<\/td>|<\/th>)/gm, '\n') // Tables
      .replace(/^<br>/gm, '') // Remove leading <br>
      .replace(/(<br>\n|<br>)/gm, '\n') // <br>
      .replace(/<h1>(.*)<\/h1>/gm, '\n\n===== $1 =====\n\n') // Header H1
      .replace(/<h[2-6]>(.*)<\/h[2-6]>/gm, '\n\n*** $1 ***\n\n') // Headers
      .replace(/(<([^>]+)>)/igm, ''); // Remove any other tags
    utils.logMessage('https://console.appnexus.com/docs/understanding-the-debug-auction');
    utils.logMessage(debugText);
  }

  return bids;
}

function responseDMX(response, bidRequest) {
  response = response.body || {};
  if (response.seatbid) {
    if (utils.isArray(response.seatbid)) {
      const {seatbid} = response;
      let winners = seatbid.reduce((bid, ads) => {
        let ad = ads.bid.reduce(function(oBid, nBid) {
          if (oBid.price < nBid.price) {
            const bid = matchRequest(nBid.impid, bidRequest);
            const {width, height} = defaultSize(bid);
            nBid.cpm = parseFloat(nBid.price).toFixed(2);
            nBid.bidId = nBid.impid;
            nBid.requestId = nBid.impid;
            nBid.width = nBid.w || width;
            nBid.height = nBid.h || height;
            nBid.mediaType = bid.mediaTypes && bid.mediaTypes.video ? 'video' : null;
            if (nBid.mediaType) {
              nBid.vastXml = cleanVast(nBid.adm);
            }
            if (nBid.dealid) {
              nBid.dealId = nBid.dealid;
            }
            nBid.uuid = nBid.bidId;
            nBid.ad = nBid.adm;
            nBid.netRevenue = true;
            nBid.creativeId = nBid.crid;
            nBid.currency = 'USD';
            nBid.ttl = 60;
            nBid.meta = nBid.meta || {};
            if (nBid.adomain && nBid.adomain.length > 0) {
              nBid.meta.advertiserDomains = nBid.adomain;
            }
            return nBid;
          } else {
            oBid.cpm = oBid.price;
            return oBid;
          }
        }, {price: 0});
        if (ad.adm) {
          bid.push(ad)
        }
        return bid;
      }, [])
      let winnersClean = winners.filter(w => {
        if (w.bidId) {
          return true;
        }
        return false;
      });
      return winnersClean;
    } else {
      return [];
    }
  } else {
    return [];
  }
}

export function matchRequest(id, bidRequest) {
  const {bids} = bidRequest.bidderRequest;
  const [returnValue] = bids.filter(bid => bid.bidId === id);
  return returnValue;
}
export function checkDeepArray(Arr) {
  if (Array.isArray(Arr)) {
    if (Array.isArray(Arr[0])) {
      return Arr[0];
    } else {
      return Arr;
    }
  } else {
    return Arr;
  }
}
export function defaultSize(thebidObj) {
  const {sizes} = thebidObj;
  const returnObject = {};
  returnObject.width = checkDeepArray(sizes)[0];
  returnObject.height = checkDeepArray(sizes)[1];
  return returnObject;
}

export function bindUserId(eids, value, source, atype) {
  if (utils.isStr(value) && Array.isArray(eids)) {
    eids.push({
      source,
      uids: [
        {
          id: value,
          atype
        }
      ]
    })
  }
}

export function getApi({protocols}) {
  let defaultValue = [2];
  let listProtocols = [
    {key: 'VPAID_1_0', value: 1},
    {key: 'VPAID_2_0', value: 2},
    {key: 'MRAID_1', value: 3},
    {key: 'ORMMA', value: 4},
    {key: 'MRAID_2', value: 5},
    {key: 'MRAID_3', value: 6},
  ];
  if (protocols) {
    return listProtocols.filter(p => {
      return protocols.indexOf(p.key) !== -1;
    }).map(p => p.value)
  } else {
    return defaultValue;
  }
}
export function getPlaybackmethod(playback) {
  if (Array.isArray(playback) && playback.length > 0) {
    return playback.map(label => {
      return VIDEO_MAPPING.playback_method[label]
    })
  }
  return [2]
}

export function getProtocols({protocols}) {
  let defaultValue = [2, 3, 5, 6, 7, 8];
  let listProtocols = [
    {key: 'VAST_1_0', value: 1},
    {key: 'VAST_2_0', value: 2},
    {key: 'VAST_3_0', value: 3},
    {key: 'VAST_1_0_WRAPPER', value: 4},
    {key: 'VAST_2_0_WRAPPER', value: 5},
    {key: 'VAST_3_0_WRAPPER', value: 6},
    {key: 'VAST_4_0', value: 7},
    {key: 'VAST_4_0_WRAPPER', value: 8}
  ];
  if (protocols) {
    return listProtocols.filter(p => {
      return protocols.indexOf(p.key) !== -1
    }).map(p => p.value);
  } else {
    return defaultValue;
  }
}

export function cleanVast(str) {
  const toberemove = /<img\s[^>]*?src\s*=\s*['\"]([^'\"]*?)['\"][^>]*?>/
  const [img, url] = str.match(toberemove)
  str = str.replace(toberemove, '')
  if (img) {
    if (url) {
      const insrt = `<Impression><![CDATA[${url}]]></Impression>`
      str = str.replace('</Impression>', `</Impression>${insrt}`)
    }
  }
  return str;
}

export function getFloor (bid) {
  let floor = null;
  if (typeof bid.getFloor === 'function') {
    const floorInfo = bid.getFloor({
      currency: 'USD',
      mediaType: bid.mediaTypes.video ? 'video' : 'banner',
      size: bid.sizes.map(size => {
        return {
          w: size[0],
          h: size[1]
        }
      })
    });
    if (typeof floorInfo === 'object' &&
      floorInfo.currency === 'USD' && !isNaN(parseFloat(floorInfo.floor))) {
      floor = parseFloat(floorInfo.floor);
    }
  }
  return floor !== null ? floor : bid.params.floor;
}

export function cleanSizes(sizes, value) {
  const supportedSize = [
    {
      size: [300, 250],
      s: 100
    },
    {
      size: [728, 90],
      s: 95
    },
    {
      size: [320, 50],
      s: 90
    },
    {
      size: [160, 600],
      s: 88
    },
    {
      size: [300, 600],
      s: 85
    },
    {
      size: [300, 50],
      s: 80
    },
    {
      size: [970, 250],
      s: 75
    },
    {
      size: [970, 90],
      s: 60
    },
  ];
  let newArray = shuffle(sizes, supportedSize);
  switch (value) {
    case 'w':
      return newArray[0][0] || 0;
    case 'h':
      return newArray[0][1] || 0;
    case 'size':
      return newArray;
    default:
      return newArray;
  }
}

export function shuffle(sizes, list) {
  let removeSizes = sizes.filter(size => {
    return list.map(l => `${l.size[0]}x${l.size[1]}`).indexOf(`${size[0]}x${size[1]}`) === -1
  })
  let reOrder = sizes.reduce((results, current) => {
    if (results.length === 0) {
      results.push(current);
      return results;
    }
    results.push(current);
    results = list.filter(l => results.map(r => `${r[0]}x${r[1]}`).indexOf(`${l.size[0]}x${l.size[1]}`) !== -1);
    results = results.sort(function(a, b) {
      return b.s - a.s;
    })
    return results.map(r => r.size);
  }, [])
  return removeDuplicate([...reOrder, ...removeSizes]);
}

export function removeDuplicate(arrayValue) {
  return arrayValue.filter((elem, index) => {
    return arrayValue.map(e => `${e[0]}x${e[1]}`).indexOf(`${elem[0]}x${elem[1]}`) === index
  })
}

export function upto5(allimps, dmxRequest, bidderRequest, DMXURI) {
  let start = 0;
  let step = 5;
  let req = [];
  while (allimps.length !== 0) {
    if (allimps.length >= 5) {
      req.push(allimps.splice(start, step))
    } else {
      req.push(allimps.splice(start, allimps.length))
    }
  }
  return req.map(r => {
    dmxRequest.imp = r;
    return {
      method: 'POST',
      url: DMXURI,
      data: JSON.stringify(dmxRequest),
      bidderRequest
    }
  })
}

registerBidder(spec);
