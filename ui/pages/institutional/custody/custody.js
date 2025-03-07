import React, {
  useState,
  useMemo,
  useCallback,
  useEffect,
  useContext,
} from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useHistory } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { useI18nContext } from '../../../hooks/useI18nContext';
import { mmiActionsFactory } from '../../../store/institutional/institution-background';
import { MetaMetricsContext } from '../../../contexts/metametrics';
import {
  ButtonIcon,
  Button,
  Label,
  IconName,
  IconSize,
  BUTTON_SIZES,
  BUTTON_VARIANT,
  Box,
} from '../../../components/component-library';
import { Text } from '../../../components/component-library/text/deprecated';
import {
  AlignItems,
  Display,
  FlexDirection,
  FontWeight,
  Color,
  JustifyContent,
  BorderRadius,
  BorderColor,
  BlockSize,
  TextColor,
  TextAlign,
  TextVariant,
} from '../../../helpers/constants/design-system';
import {
  CUSTODY_ACCOUNT_DONE_ROUTE,
  DEFAULT_ROUTE,
} from '../../../helpers/constants/routes';
import { getCurrentChainId, getSelectedAddress } from '../../../selectors';
import { getMMIConfiguration } from '../../../selectors/institutional/selectors';
import CustodyAccountList from '../connect-custody/account-list';
import JwtUrlForm from '../../../components/institutional/jwt-url-form';
import {
  MetaMetricsEventCategory,
  MetaMetricsEventName,
} from '../../../../shared/constants/metametrics';
import PulseLoader from '../../../components/ui/pulse-loader/pulse-loader';

const CustodyPage = () => {
  const t = useI18nContext();
  const history = useHistory();
  const trackEvent = useContext(MetaMetricsContext);
  const dispatch = useDispatch();

  const mmiActions = mmiActionsFactory();
  const currentChainId = useSelector(getCurrentChainId);
  const { custodians } = useSelector(getMMIConfiguration);

  const [loading, setLoading] = useState(true);
  const [selectedAccounts, setSelectedAccounts] = useState({});
  const [selectedCustodianName, setSelectedCustodianName] = useState('');
  const [selectedCustodianImage, setSelectedCustodianImage] = useState(null);
  const [selectedCustodianDisplayName, setSelectedCustodianDisplayName] =
    useState('');
  const [selectedCustodianType, setSelectedCustodianType] = useState('');
  const [connectError, setConnectError] = useState('');
  const [currentJwt, setCurrentJwt] = useState('');
  const [selectError, setSelectError] = useState('');
  const [jwtList, setJwtList] = useState([]);
  const [apiUrl, setApiUrl] = useState('');
  const [addNewTokenClicked, setAddNewTokenClicked] = useState(false);
  const [chainId, setChainId] = useState(0);
  const [connectRequest, setConnectRequest] = useState(undefined);
  const [accounts, setAccounts] = useState();
  const address = useSelector(getSelectedAddress);

  const custodianButtons = useMemo(() => {
    const custodianItems = [];

    const sortedCustodians = custodians.sort(function (a, b) {
      const nameA = a.name.toLowerCase();
      const nameB = b.name.toLowerCase();

      if (nameA < nameB) {
        return -1;
      }
      if (nameA > nameB) {
        return 1;
      }
      return 0;
    });

    sortedCustodians.forEach((custodian) => {
      if (
        (!custodian.production &&
          process.env.METAMASK_ENVIRONMENT === 'production') ||
        custodian.hidden ||
        (connectRequest &&
          Object.keys(connectRequest).length &&
          custodian.name !== selectedCustodianName)
      ) {
        return;
      }

      custodianItems.push(
        <Box
          key={uuidv4()}
          display={Display.Flex}
          flexDirection={FlexDirection.Row}
          justifyContent={JustifyContent.spaceBetween}
          alignItems={AlignItems.center}
          borderColor={BorderColor.borderDefault}
          borderRadius={BorderRadius.SM}
          padding={4}
          marginBottom={4}
        >
          <Box display={Display.Flex} alignItems={AlignItems.center}>
            {custodian.iconUrl && (
              <img
                width={32}
                height={32}
                src={custodian.iconUrl}
                alt={custodian.displayName}
              />
            )}
            <Text marginLeft={2}>{custodian.displayName}</Text>
          </Box>

          <Button
            size={BUTTON_SIZES.SM}
            data-testid="custody-connect-button"
            onClick={async (_) => {
              const jwtListValue = await dispatch(
                mmiActions.getCustodianJWTList(custodian.name),
              );
              setSelectedCustodianName(custodian.name);
              setSelectedCustodianType(custodian.type);
              setSelectedCustodianImage(custodian.iconUrl);
              setSelectedCustodianDisplayName(custodian.displayName);
              setApiUrl(custodian.apiUrl);
              setCurrentJwt(jwtListValue[0] || '');
              setJwtList(jwtListValue);
              trackEvent({
                category: MetaMetricsEventCategory.MMI,
                event: MetaMetricsEventName.CustodianSelected,
                properties: {
                  custodian: custodian.name,
                },
              });
            }}
          >
            {t('select')}
          </Button>
        </Box>,
      );
    });

    return custodianItems;
  }, [
    connectRequest,
    custodians,
    dispatch,
    mmiActions,
    selectedCustodianName,
    t,
    trackEvent,
  ]);

  const handleConnectError = useCallback(
    (e) => {
      let errorMessage;
      const detailedError = e.message.split(':');

      if (detailedError.length > 1 && !isNaN(parseInt(detailedError[0], 10))) {
        if (parseInt(detailedError[0], 10) === 401) {
          // Authentication Error
          errorMessage =
            'Authentication error. Please ensure you have entered the correct token';
        }
      }

      if (/Network Error/u.test(e.message)) {
        errorMessage =
          'Network error. Please ensure you have entered the correct API URL';
      }

      if (!errorMessage) {
        errorMessage = e.message;
      }

      setConnectError(
        `Something went wrong connecting your custodian account. Error details: ${errorMessage}`,
      );
      trackEvent({
        category: MetaMetricsEventCategory.MMI,
        event: MetaMetricsEventName.CustodianConnectionFailed,
        properties: {
          custodian: selectedCustodianName,
        },
      });
    },
    [selectedCustodianName, trackEvent],
  );

  const getCustodianAccounts = useCallback(
    async (token, getNonImportedAccounts) => {
      return await dispatch(
        mmiActions.getCustodianAccounts(
          token,
          apiUrl,
          selectedCustodianType,
          getNonImportedAccounts,
        ),
      );
    },
    [dispatch, mmiActions, apiUrl, selectedCustodianType],
  );

  const connect = useCallback(async () => {
    try {
      // If you have one JWT already, but no dropdown yet, currentJwt is null!
      const jwt = currentJwt || jwtList[0];
      setConnectError('');
      const accountsValue = await getCustodianAccounts(jwt, true);

      setAccounts(accountsValue);
      trackEvent({
        category: MetaMetricsEventCategory.MMI,
        event: MetaMetricsEventName.CustodianConnected,
        properties: {
          custodian: selectedCustodianName,
          apiUrl,
          rpc: Boolean(connectRequest),
        },
      });
    } catch (e) {
      handleConnectError(e);
    }
  }, [
    apiUrl,
    connectRequest,
    currentJwt,
    getCustodianAccounts,
    handleConnectError,
    jwtList,
    selectedCustodianName,
    trackEvent,
  ]);

  useEffect(() => {
    setLoading(true);
    const fetchConnectRequest = async () => {
      const connectRequestValue = await dispatch(
        mmiActions.getCustodianConnectRequest(),
      );

      setChainId(parseInt(currentChainId, 16));

      // check if it's empty object
      if (Object.keys(connectRequestValue).length) {
        setConnectRequest(connectRequestValue);
        setCurrentJwt(
          connectRequestValue.token ||
            (await dispatch(mmiActions.getCustodianToken(address))),
        );
        setSelectedCustodianType(connectRequestValue.custodianType);
        setSelectedCustodianName(connectRequestValue.custodianName);
        setApiUrl(connectRequestValue.apiUrl);
      }
    };

    const handleFetchConnectRequest = async () => {
      try {
        await fetchConnectRequest();
        setLoading(false);
      } catch (error) {
        console.error(error);
        setLoading(false);
      }
    };

    handleFetchConnectRequest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handleNetworkChange = async () => {
      if (!isNaN(chainId)) {
        const jwt = currentJwt || jwtList[0];

        if (jwt && jwt.length) {
          setAccounts(await getCustodianAccounts(jwt, true));
        }
      }
    };

    if (parseInt(chainId, 16) !== chainId) {
      setChainId(parseInt(currentChainId, 16));
      handleNetworkChange();
    }
  }, [
    getCustodianAccounts,
    apiUrl,
    currentJwt,
    jwtList,
    selectedCustodianType,
    currentChainId,
    chainId,
  ]);

  const cancelConnectCustodianToken = () => {
    setSelectedCustodianName('');
    setSelectedCustodianType('');
    setSelectedCustodianImage(null);
    setSelectedCustodianDisplayName('');
    setApiUrl('');
    setCurrentJwt('');
    setConnectError('');
    setSelectError('');
  };

  const setSelectAllAccounts = (e) => {
    const allAccounts = {};

    if (e.currentTarget.checked) {
      accounts.forEach((account) => {
        allAccounts[account.address] = {
          name: account.name,
          custodianDetails: account.custodianDetails,
          labels: account.labels,
          token: currentJwt,
          apiUrl,
          chainId: account.chainId,
          custodyType: selectedCustodianType,
          custodyName: selectedCustodianName,
        };
      });
      setSelectedAccounts(allAccounts);
    } else {
      setSelectedAccounts({});
    }
  };

  if (loading) {
    return <PulseLoader />;
  }

  return (
    <Box className="page-container">
      {connectError && (
        <Text textAlign={TextAlign.Center} marginTop={3} padding={[2, 7, 5]}>
          {connectError}
        </Text>
      )}
      {selectError && (
        <Text textAlign={TextAlign.Center} marginTop={3} padding={[2, 7, 5]}>
          {selectError}
        </Text>
      )}

      {!accounts && !selectedCustodianType ? (
        <Box
          padding={4}
          display={Display.Flex}
          flexDirection={FlexDirection.Column}
          className="page-container__content"
          width={BlockSize.Full}
        >
          <Box
            display={Display.Flex}
            alignItems={AlignItems.center}
            marginBottom={4}
            marginTop={4}
          >
            <ButtonIcon
              ariaLabel={t('back')}
              iconName={IconName.ArrowLeft}
              size={IconSize.Sm}
              color={Color.iconDefault}
              onClick={() => history.push(DEFAULT_ROUTE)}
              display={Display.Flex}
            />
            <Text>{t('back')}</Text>
          </Box>
          <Text as="h4" variant={TextVariant.bodyLgMedium} marginTop={4}>
            {t('connectCustodialAccountTitle')}
          </Text>
          <Text
            as="h6"
            color={TextColor.textDefault}
            marginTop={2}
            marginBottom={5}
          >
            {t('connectCustodialAccountMsg')}
          </Text>
          <Box>
            <ul width={BlockSize.Full}>{custodianButtons}</ul>
          </Box>
        </Box>
      ) : null}
      {!accounts && selectedCustodianType && (
        <>
          <Box
            padding={4}
            display={Display.Flex}
            flexDirection={FlexDirection.Column}
            className="page-container__content"
            width={BlockSize.Full}
          >
            <Box
              display={Display.Flex}
              alignItems={AlignItems.center}
              marginBottom={4}
              marginTop={4}
            >
              <ButtonIcon
                ariaLabel={t('back')}
                iconName={IconName.ArrowLeft}
                size={IconSize.Sm}
                color={Color.iconDefault}
                onClick={() => cancelConnectCustodianToken()}
                display={[Display.Flex]}
              />
              <Text>{t('back')}</Text>
            </Box>
            {selectedCustodianImage && (
              <Box display={Display.Flex} alignItems={AlignItems.center}>
                <img
                  width={32}
                  height={32}
                  src={selectedCustodianImage}
                  alt={selectedCustodianDisplayName}
                />
                <Text as="h4" marginLeft={2}>
                  {selectedCustodianDisplayName}
                </Text>
              </Box>
            )}
            <Text marginTop={4}>
              {t('enterCustodianToken', [selectedCustodianDisplayName])}
            </Text>
            <Box paddingBottom={7}>
              <JwtUrlForm
                jwtList={jwtList}
                currentJwt={currentJwt}
                onJwtChange={(jwt) => setCurrentJwt(jwt)}
                jwtInputText={t('pasteJWTToken')}
                apiUrl={apiUrl}
                urlInputText={t('custodyApiUrl', [
                  selectedCustodianDisplayName,
                ])}
                onUrlChange={(url) => setApiUrl(url)}
              />
            </Box>
          </Box>
          <Box as="footer" className="page-container__footer" padding={4}>
            {loading ? (
              <PulseLoader />
            ) : (
              <Box display={Display.Flex} gap={4}>
                <Button
                  block
                  variant={BUTTON_VARIANT.SECONDARY}
                  size={BUTTON_SIZES.LG}
                  onClick={() => {
                    cancelConnectCustodianToken();
                  }}
                >
                  {t('cancel')}
                </Button>
                <Button
                  block
                  data-testid="jwt-form-connect-button"
                  size={BUTTON_SIZES.LG}
                  onClick={connect}
                  disabled={
                    !selectedCustodianName ||
                    (addNewTokenClicked && !currentJwt)
                  }
                >
                  {t('connect')}
                </Button>
              </Box>
            )}
          </Box>
        </>
      )}
      {accounts && accounts.length > 0 && (
        <>
          <Box padding={[5, 7, 2]} width={BlockSize.Full}>
            <Text as="h4">{t('selectAnAccount')}</Text>
            <Text marginTop={2} marginBottom={2}>
              {t('selectAnAccountHelp')}
            </Text>
          </Box>
          <Box
            padding={[5, 7, 0]}
            display={Display.Flex}
            flexDirection={FlexDirection.Row}
            justifyContent={JustifyContent.flexStart}
            alignItems={AlignItems.center}
          >
            <input
              type="checkbox"
              id="selectAllAccounts"
              name="selectAllAccounts"
              marginRight={2}
              marginLeft={2}
              value={{}}
              onChange={(e) => setSelectAllAccounts(e)}
              checked={Object.keys(selectedAccounts).length === accounts.length}
            />
            <Label htmlFor="selectAllAccounts">{t('selectAllAccounts')}</Label>
          </Box>
          <CustodyAccountList
            custody={selectedCustodianName}
            accounts={accounts}
            onAccountChange={(account) => {
              setSelectedAccounts((prevSelectedAccounts) => {
                const updatedSelectedAccounts = { ...prevSelectedAccounts };

                if (updatedSelectedAccounts[account.address]) {
                  delete updatedSelectedAccounts[account.address];
                } else {
                  updatedSelectedAccounts[account.address] = {
                    name: account.name,
                    custodianDetails: account.custodianDetails,
                    labels: account.labels,
                    token: currentJwt,
                    apiUrl,
                    chainId: account.chainId,
                    custodyType: selectedCustodianType,
                    custodyName: selectedCustodianName,
                  };
                }

                return updatedSelectedAccounts;
              });
            }}
            selectedAccounts={selectedAccounts}
            onAddAccounts={async () => {
              try {
                const selectedCustodian = custodians.find(
                  (custodian) => custodian.name === selectedCustodianName,
                );

                await dispatch(
                  mmiActions.connectCustodyAddresses(
                    selectedCustodianType,
                    selectedCustodianName,
                    selectedAccounts,
                  ),
                );

                trackEvent({
                  category: MetaMetricsEventCategory.MMI,
                  event: MetaMetricsEventName.CustodialAccountsConnected,
                  properties: {
                    custodian: selectedCustodianName,
                    numberOfAccounts: Object.keys(selectedAccounts).length,
                    chainId,
                  },
                });

                history.push({
                  pathname: CUSTODY_ACCOUNT_DONE_ROUTE,
                  state: {
                    imgSrc: selectedCustodian.iconUrl,
                    title: t('custodianAccountAddedTitle'),
                    description: t('custodianAccountAddedDesc'),
                  },
                });
              } catch (e) {
                setSelectError(e.message);
              }
            }}
            onCancel={() => {
              setAccounts(null);
              setSelectedCustodianName(null);
              setSelectedCustodianType(null);
              setSelectedAccounts({});
              setCurrentJwt('');
              setApiUrl('');
              setAddNewTokenClicked(false);

              if (Object.keys(connectRequest).length) {
                history.push(DEFAULT_ROUTE);
              }

              trackEvent({
                category: MetaMetricsEventCategory.MMI,
                event: MetaMetricsEventName.CustodianConnectionCanceled,
                properties: {
                  custodian: selectedCustodianName,
                  numberOfAccounts: Object.keys(selectedAccounts).length,
                  chainId,
                },
              });
            }}
          />
        </>
      )}
      {accounts && accounts.length === 0 && (
        <>
          <Box
            data-testid="custody-accounts-empty"
            padding={[6, 7, 2]}
            className="page-container__content"
          >
            <Text
              marginBottom={2}
              fontWeight={FontWeight.Bold}
              color={TextColor.textDefault}
              variant={TextVariant.bodyLgMedium}
            >
              {t('allCustodianAccountsConnectedTitle')}
            </Text>
            <Text variant={TextVariant.bodyMd}>
              {t('allCustodianAccountsConnectedSubtitle')}
            </Text>
          </Box>
          <Box as="footer" className="page-container__footer" padding={4}>
            <Button
              block
              size={BUTTON_SIZES.LG}
              type={BUTTON_VARIANT.SECONDARY}
              onClick={() => history.push(DEFAULT_ROUTE)}
            >
              {t('close')}
            </Button>
          </Box>
        </>
      )}
    </Box>
  );
};

export default CustodyPage;
