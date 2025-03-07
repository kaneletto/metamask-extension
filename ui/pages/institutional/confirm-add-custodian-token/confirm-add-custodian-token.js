import React, { useContext, useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { isEqual } from 'lodash';
import { useHistory } from 'react-router-dom';
import PulseLoader from '../../../components/ui/pulse-loader';
import { CUSTODY_ACCOUNT_ROUTE } from '../../../helpers/constants/routes';
import {
  AlignItems,
  Display,
  TextColor,
  TextAlign,
  FlexDirection,
} from '../../../helpers/constants/design-system';
import { BUILT_IN_NETWORKS } from '../../../../shared/constants/network';
import { I18nContext } from '../../../contexts/i18n';
import { MetaMetricsContext } from '../../../contexts/metametrics';
import { getMostRecentOverviewPage } from '../../../ducks/history/history';
import { setProviderType } from '../../../store/actions';
import { mmiActionsFactory } from '../../../store/institutional/institution-background';
import {
  Label,
  ButtonLink,
  Button,
  BUTTON_SIZES,
  BUTTON_VARIANT,
  Box,
} from '../../../components/component-library';
import { Text } from '../../../components/component-library/text/deprecated';
import {
  MetaMetricsEventCategory,
  MetaMetricsEventName,
} from '../../../../shared/constants/metametrics';
import {
  complianceActivated,
  getInstitutionalConnectRequests,
} from '../../../ducks/institutional/institutional';

const ConfirmAddCustodianToken = () => {
  const t = useContext(I18nContext);
  const dispatch = useDispatch();
  const history = useHistory();
  const trackEvent = useContext(MetaMetricsContext);
  const mmiActions = mmiActionsFactory();

  const mostRecentOverviewPage = useSelector(getMostRecentOverviewPage);
  const connectRequests = useSelector(getInstitutionalConnectRequests, isEqual);
  const isComplianceActivated = useSelector(complianceActivated);
  const [showMore, setShowMore] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [connectError, setConnectError] = useState('');

  const connectRequest = connectRequests ? connectRequests[0] : undefined;

  useEffect(() => {
    if (!connectRequest) {
      history.push(mostRecentOverviewPage);
      setIsLoading(false);
    }
  }, [connectRequest, history, mostRecentOverviewPage]);

  if (!connectRequest) {
    return null;
  }

  trackEvent({
    category: MetaMetricsEventCategory.MMI,
    event: MetaMetricsEventName.TokenAdded,
    properties: {
      actions: 'Custodian RPC request',
      custodian: connectRequest.custodian,
      apiUrl: connectRequest.apiUrl,
    },
  });

  let custodianLabel = '';

  if (
    connectRequest.labels &&
    connectRequest.labels.some((label) => label.key === 'service')
  ) {
    custodianLabel = connectRequest.labels.find(
      (label) => label.key === 'service',
    ).value;
  }

  return (
    <Box className="page-container">
      <Box className="page-container__header">
        <Text className="page-container__title">{t('custodianAccount')}</Text>
        <Text className="page-container__subtitle">
          {t('mmiAddToken', [connectRequest.origin])}
        </Text>
      </Box>
      <Box padding={4} className="page-container__content">
        {custodianLabel && (
          <>
            <Text padding={4} color={TextColor.textDefault}>
              {t('custodian')}
            </Text>
            <Label
              marginRight={4}
              marginLeft={4}
              color={TextColor.textAlternative}
              className="add_custodian_token_confirm__url"
            >
              {custodianLabel}
            </Label>
          </>
        )}

        <Text padding={4} color={TextColor.textDefault}>
          {t('token')}
        </Text>
        <Box
          marginRight={4}
          marginLeft={4}
          className="add_custodian_token_confirm__token"
        >
          <Box
            paddingTop={2}
            paddingBottom={2}
            display={Display.Flex}
            flexDirection={FlexDirection.Row}
            alignItems={AlignItems.center}
          >
            <Text>
              {showMore && connectRequest?.token
                ? connectRequest?.token
                : `...${connectRequest?.token.slice(-9)}`}
            </Text>
            {!showMore && (
              <Box paddingLeft={2}>
                <ButtonLink
                  rel="noopener noreferrer"
                  onClick={() => {
                    setShowMore(true);
                  }}
                >
                  {t('showMore')}
                </ButtonLink>
              </Box>
            )}
          </Box>
        </Box>
        {connectRequest.apiUrl && (
          <Box>
            <Text padding={4} color={TextColor.textDefault}>
              {t('apiUrl')}
            </Text>
            <Text
              marginRight={4}
              marginLeft={4}
              color={TextColor.textAlternative}
              fontSize="14"
              className="add_custodian_token_confirm__url"
            >
              {connectRequest.apiUrl}
            </Text>
          </Box>
        )}
      </Box>

      {!isComplianceActivated && (
        <Box marginTop={4} data-testid="connect-custodian-token-error">
          <Text data-testid="error-message" textAlign={TextAlign.Center}>
            {connectError}
          </Text>
        </Box>
      )}

      <Box as="footer" className="page-container__footer" padding={4}>
        {isLoading ? (
          <PulseLoader />
        ) : (
          <Box display={Display.Flex} gap={4}>
            <Button
              block
              variant={BUTTON_VARIANT.SECONDARY}
              size={BUTTON_SIZES.LG}
              data-testid="cancel-btn"
              onClick={async () => {
                await dispatch(
                  mmiActions.removeAddTokenConnectRequest({
                    origin: connectRequest.origin,
                    apiUrl: connectRequest.apiUrl,
                    token: connectRequest.token,
                  }),
                );

                trackEvent({
                  category: MetaMetricsEventCategory.MMI,
                  event: MetaMetricsEventName.TokenAdded,
                  properties: {
                    actions: 'Custodian RPC cancel',
                    custodian: connectRequest.custodian,
                    apiUrl: connectRequest.apiUrl,
                  },
                });
              }}
            >
              {t('cancel')}
            </Button>
            <Button
              block
              data-testid="confirm-btn"
              size={BUTTON_SIZES.LG}
              onClick={async () => {
                setConnectError('');
                setIsLoading(true);

                try {
                  if (connectRequest.chainId) {
                    const networkType = Object.keys(BUILT_IN_NETWORKS).find(
                      (key) =>
                        Number(BUILT_IN_NETWORKS[key].chainId).toString(10) ===
                        connectRequest.chainId.toString(),
                    );
                    await dispatch(setProviderType(networkType));
                  }

                  let custodianName = connectRequest.service.toLowerCase();

                  if (connectRequest.service === 'JSONRPC') {
                    custodianName = connectRequest.environment;
                  }

                  await dispatch(
                    mmiActions.setCustodianConnectRequest({
                      token: connectRequest.token,
                      apiUrl: connectRequest.apiUrl,
                      custodianName,
                      custodianType: connectRequest.service,
                    }),
                  );

                  await dispatch(
                    mmiActions.removeAddTokenConnectRequest({
                      origin: connectRequest.origin,
                      apiUrl: connectRequest.apiUrl,
                      token: connectRequest.token,
                    }),
                  );

                  trackEvent({
                    category: MetaMetricsEventCategory.MMI,
                    event: MetaMetricsEventName.TokenAdded,
                    properties: {
                      actions: 'Custodian RPC confirm',
                      custodian: connectRequest.custodian,
                      apiUrl: connectRequest.apiUrl,
                    },
                  });

                  history.push(CUSTODY_ACCOUNT_ROUTE);
                } catch (e) {
                  let errorMessage = e.message;

                  if (!errorMessage) {
                    errorMessage = 'Connection error';
                  }

                  setConnectError(errorMessage);
                  setIsLoading(false);
                }
              }}
            >
              {t('confirm')}
            </Button>
          </Box>
        )}
      </Box>
    </Box>
  );
};

export default ConfirmAddCustodianToken;
