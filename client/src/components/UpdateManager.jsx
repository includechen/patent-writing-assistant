import { useState, useEffect } from 'react';

import { useI18n } from '../i18n';

import AppModal from './AppModal';

import UpdateInstallOverlay from './UpdateInstallOverlay';



const FLOW_STATUSES = ['checking', 'downloading', 'installing'];



export default function UpdateManager({ children }) {

  const { t } = useI18n();

  const [status, setStatus] = useState(null);

  const [about, setAbout] = useState(null);



  useEffect(() => {

    if (!window.patentApp?.onUpdateStatus) return undefined;

    window.patentApp.getUpdateStatus?.().then(setStatus).catch(() => {});

    return window.patentApp.onUpdateStatus((next) => setStatus(next));

  }, []);



  useEffect(() => {

    if (!window.patentApp?.onShowAbout) return undefined;

    return window.patentApp.onShowAbout((payload) => setAbout(payload));

  }, []);



  const dialog = status?.dialog;

  const inFlow = FLOW_STATUSES.includes(status?.status);



  const clearDialog = () => window.patentApp?.clearUpdateDialog?.();



  const handleDialogAction = (actionId) => {

    if (!dialog) return;

    if (dialog.kind === 'available') {

      if (actionId === 'download') window.patentApp?.downloadUpdate?.();

      else clearDialog();

      return;

    }

    if (dialog.kind === 'downloaded') {

      if (actionId === 'install') window.patentApp?.installUpdate?.();

      else clearDialog();

      return;

    }

    if (dialog.kind === 'error') {

      if (actionId === 'browser') window.patentApp?.openUpdateRelease?.();

      clearDialog();

      return;

    }

    clearDialog();

  };



  let modalProps = null;

  if (dialog?.kind === 'available') {

    modalProps = {

      title: t('update.modalTitle'),

      message: t('update.available', { version: dialog.version || '' }),

      icon: 'info',

      buttons: [

        { id: 'download', label: t('update.download'), primary: true },

        { id: 'later', label: t('update.dismiss') },

      ],

    };

  } else if (dialog?.kind === 'downloaded') {

    modalProps = {

      title: t('update.modalTitle'),

      message: t('update.downloadedPrompt', { version: dialog.version || '' }),

      icon: 'success',

      buttons: [

        { id: 'install', label: t('update.startInstall'), primary: true },

        { id: 'later', label: t('update.dismiss') },

      ],

    };

  } else if (dialog?.kind === 'info') {

    modalProps = {

      title: t('update.modalTitle'),

      message: dialog.message || t('update.notAvailable'),

      icon: 'info',

      buttons: [{ id: 'ok', label: t('update.ok'), primary: true }],

    };

  } else if (dialog?.kind === 'error') {

    const buttons = [{ id: 'ok', label: t('update.ok'), primary: true }];

    if (dialog.offerBrowser) {

      buttons.unshift({ id: 'browser', label: t('update.openInBrowser'), primary: false });

    }

    modalProps = {

      title: t('update.modalTitle'),

      message: dialog.message || t('update.error', { message: status?.error || '' }),

      icon: 'warning',

      buttons,

    };

  } else if (dialog?.kind === 'no-url') {

    modalProps = {

      title: t('update.modalTitle'),

      message: t('update.noUrl'),

      icon: 'warning',

      buttons: [{ id: 'ok', label: t('update.ok'), primary: true }],

    };

  }



  return (

    <>

      <div className={inFlow ? 'app-shell app-shell-hidden' : 'app-shell'}>

        {children}

      </div>

      <UpdateInstallOverlay status={status} />

      <AppModal

        open={!!modalProps && !inFlow}

        title={modalProps?.title}

        message={modalProps?.message}

        detail={modalProps?.detail}

        icon={modalProps?.icon}

        buttons={modalProps?.buttons || []}

        onAction={handleDialogAction}

        onClose={clearDialog}

      />

      <AppModal

        open={!!about}

        title={t('about.title')}

        message={t('appName')}

        detail={about ? [

          `${t('about.version')}: ${about.version || '—'}`,

          `${t('about.author')}: ${about.author || '—'}`,

          `${t('about.contact')}: ${about.email || '—'}`,

        ].join('\n') : ''}

        icon="info"

        buttons={[{ id: 'ok', label: t('update.ok'), primary: true }]}

        onAction={() => setAbout(null)}

        onClose={() => setAbout(null)}

      />

    </>

  );

}

