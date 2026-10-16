import { Fragment, useEffect, useState } from 'react';
import { api } from '../../api/client';
import { generateDocumentsPdf, buildDocumentsToDownload } from '../../utils/orderPdf';
import AdminManualOrderModal from './AdminManualOrderModal';
import AdminExchangeModal from './AdminExchangeModal';

const formatPrice = (amount) =>
  (Number(amount) || 0).toLocaleString('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + ' TND';

function getPageNumbers(currentPage, totalPages) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const pages = [];
  pages.push(1);
  if (currentPage > 3) {
    pages.push('...');
  }
  const start = Math.max(2, currentPage - 1);
  const end = Math.min(totalPages - 1, currentPage + 1);
  for (let i = start; i <= end; i++) {
    pages.push(i);
  }
  if (currentPage < totalPages - 2) {
    pages.push('...');
  }
  pages.push(totalPages);
  return pages;
}

export default function AdminOrders({ refreshKey = 0, onOrderCreated, highlightOrderId = null }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedOrderIds, setExpandedOrderIds] = useState([]);
  const [manualOrderOpen, setManualOrderOpen] = useState(false);
  const [exchangeModalOrder, setExchangeModalOrder] = useState(null);
  const [selectedOrderIds, setSelectedOrderIds] = useState([]);
  const [selectedExchangeIds, setSelectedExchangeIds] = useState([]);
  const [selectedRefundIds, setSelectedRefundIds] = useState([]);
  const [downloading, setDownloading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortDirection, setSortDirection] = useState('desc'); // 'desc' (newest -> oldest), 'asc' (oldest -> newest)
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [activeHighlightId, setActiveHighlightId] = useState(null);

  const toggleExpand = (orderId) => {
    setExpandedOrderIds((prev) =>
      prev.includes(orderId) ? prev.filter((id) => id !== orderId) : [...prev, orderId],
    );
  };

  const loadOrders = (isInitial = false) => {
    if (isInitial) setLoading(true);
    setError('');
    api
      .getOrders()
      .then(setOrders)
      .catch((err) => setError(err.message))
      .finally(() => {
        if (isInitial) setLoading(false);
      });
  };

  useEffect(() => {
    loadOrders(!orders.length);
  }, [refreshKey]);

  // Filtering pipeline: search query + status dropdown
  const filteredOrders = orders.filter((order) => {
    // 1. Search Query Filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const orderNumMatch = order.orderNumber?.toLowerCase().includes(q);
      const orderIdMatch = order.id?.toLowerCase().includes(q);
      const firstName = (order.customer?.firstName || order.customer?.name || '').toLowerCase();
      const lastName = (order.customer?.lastName || '').toLowerCase();
      const fullName = `${firstName} ${lastName}`.trim();
      const nameMatch = firstName.includes(q) || lastName.includes(q) || fullName.includes(q);
      const phoneMatch = order.customer?.phone?.toLowerCase().includes(q);
      const emailMatch = order.customer?.email?.toLowerCase().includes(q);

      if (!(orderNumMatch || orderIdMatch || nameMatch || phoneMatch || emailMatch)) {
        return false;
      }
    }

    // 2. Status Filter
    if (statusFilter && statusFilter !== 'all') {
      if (statusFilter === 'unconfirmed') {
        if (order.status !== 'pending' && order.status !== 'processing') return false;
      } else if (statusFilter === 'confirmed') {
        if (order.status !== 'completed' && order.status !== 'confirmed') return false;
      } else if (statusFilter === 'exchanged') {
        if (order.status !== 'exchanged') return false;
      } else if (statusFilter === 'refunded') {
        if (order.status !== 'refunded') return false;
      } else if (statusFilter === 'cancelled') {
        if (order.status !== 'cancelled') return false;
      }
    }

    return true;
  });

  // Sorting pipeline (default: newest -> oldest)
  const sortedOrders = [...filteredOrders].sort((a, b) => {
    const timeA = new Date(a.createdAt || 0).getTime();
    const timeB = new Date(b.createdAt || 0).getTime();
    return sortDirection === 'asc' ? timeA - timeB : timeB - timeA;
  });

  const toggleDateSort = () => {
    setSortDirection((prev) => (prev === 'desc' ? 'asc' : 'desc'));
  };

  // Pagination calculations
  const totalOrders = sortedOrders.length;
  const totalPages = Math.max(1, Math.ceil(totalOrders / pageSize));
  const activePage = Math.min(currentPage, totalPages);
  const startIndex = (activePage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalOrders);
  const paginatedOrders = sortedOrders.slice(startIndex, endIndex);

  // Handle notification highlight scroll & auto-navigate page
  useEffect(() => {
    if (highlightOrderId && orders.length > 0) {
      const orderIdx = sortedOrders.findIndex((o) => o.id === highlightOrderId);
      if (orderIdx !== -1) {
        const targetPage = Math.floor(orderIdx / pageSize) + 1;
        setCurrentPage(targetPage);
      }
      setSearchQuery('');
      setStatusFilter('all');
      setActiveHighlightId(highlightOrderId);
      const timer = setTimeout(() => {
        const el = document.getElementById(`order-${highlightOrderId}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);

      const clearTimer = setTimeout(() => {
        setActiveHighlightId(null);
      }, 3500);

      return () => {
        clearTimeout(timer);
        clearTimeout(clearTimer);
      };
    }
  }, [highlightOrderId, orders]);

  // Page-scoped select-all state
  const pageOrderIds = paginatedOrders.map((o) => o.id);
  const isAllPageSelected =
    pageOrderIds.length > 0 && pageOrderIds.every((id) => selectedOrderIds.includes(id));
  const isSomePageSelected =
    pageOrderIds.some((id) => selectedOrderIds.includes(id)) && !isAllPageSelected;

  const toggleSelectPage = () => {
    if (isAllPageSelected) {
      // Unselect only orders on the current visible page, preserving other pages
      setSelectedOrderIds((prev) => prev.filter((id) => !pageOrderIds.includes(id)));
    } else {
      // Add visible orders on this page to global selection
      setSelectedOrderIds((prev) => Array.from(new Set([...prev, ...pageOrderIds])));
    }
  };

  const toggleSelectOrder = (id) => {
    setSelectedOrderIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const toggleSelectExchange = (id) => {
    setSelectedExchangeIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const toggleSelectRefund = (id) => {
    setSelectedRefundIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  // Global selections evaluation (across ALL orders / pages)
  const selectedOrders = orders.filter((o) => selectedOrderIds.includes(o.id));

  const selectedExchanges = [];
  orders.forEach((order) => {
    if (Array.isArray(order.exchanges)) {
      order.exchanges.forEach((ex) => {
        if (selectedExchangeIds.includes(ex.id)) {
          selectedExchanges.push({
            ...ex,
            orderNumber: ex.orderNumber || order.orderNumber,
          });
        }
      });
    }
  });

  const selectedRefunds = [];
  orders.forEach((order) => {
    if (Array.isArray(order.refunds)) {
      order.refunds.forEach((ref) => {
        if (selectedRefundIds.includes(ref.id)) {
          selectedRefunds.push({
            ...ref,
            orderNumber: ref.orderNumber || order.orderNumber,
          });
        }
      });
    }
  });

  const totalSelectedCount =
    selectedOrders.length +
    selectedExchanges.length +
    selectedRefunds.length;

  const hasSelectedOrders = selectedOrders.length > 0;
  const hasSelectedExchangesOrRefunds =
    selectedExchangeIds.length > 0 || selectedRefundIds.length > 0;

  // Confirmer is enabled ONLY when every globally selected order is unconfirmed (pending or processing)
  // If at least one selected order is not pending/processing, or if exchanges/refunds are selected, it is disabled.
  const canConfirm =
    hasSelectedOrders &&
    !hasSelectedExchangesOrRefunds &&
    selectedOrders.every(
      (o) => o.status === 'pending' || o.status === 'processing',
    );

  const handlePrintOrder = (order) => {
    const docs = buildDocumentsToDownload([order], [order.id], [], []);
    generateDocumentsPdf(docs);
  };

  const handlePrintSelected = () => {
    if (totalSelectedCount === 0) return;
    const documentsToPrint = buildDocumentsToDownload(
      orders,
      selectedOrderIds,
      selectedExchangeIds,
      selectedRefundIds,
    );
    if (documentsToPrint.length === 0) return;
    generateDocumentsPdf(documentsToPrint);
  };

  const handleDownloadSelected = async () => {
    if (totalSelectedCount === 0) return;
    setDownloading(true);
    setError('');

    try {
      // 1. Explicit order confirmation operation FIRST for unconfirmed normal orders
      const unconfirmedIds = selectedOrders
        .filter((o) => o.status === 'pending' || o.status === 'processing')
        .map((o) => o.id);

      if (unconfirmedIds.length > 0) {
        await api.confirmOrders(unconfirmedIds);
      }

      // 2. Build deterministic ordered document list
      const documentsToDownload = buildDocumentsToDownload(
        orders,
        selectedOrderIds,
        selectedExchangeIds,
        selectedRefundIds,
      );

      // 3. Generate and download PDF (side-effect free)
      generateDocumentsPdf(documentsToDownload);

      setSelectedOrderIds([]);
      setSelectedExchangeIds([]);
      setSelectedRefundIds([]);
      if (unconfirmedIds.length > 0) {
        loadOrders();
        onOrderCreated?.();
      }
    } catch (err) {
      setError(err.message || 'Erreur lors de la confirmation ou du téléchargement');
    } finally {
      setDownloading(false);
    }
  };

  const handleConfirmSingleOrder = async (order) => {
    setError('');
    try {
      // 1. Explicit order confirmation operation for this single order
      await api.confirmOrders([order.id]);

      // 2. Build deterministic ordered document list
      const documentsToDownload = buildDocumentsToDownload(
        [order],
        [order.id],
        [],
        [],
      );

      // 3. Generate and download PDF (side-effect free)
      if (documentsToDownload.length > 0) {
        generateDocumentsPdf(documentsToDownload);
      }

      setSelectedOrderIds((prev) => prev.filter((id) => id !== order.id));
      loadOrders();
      onOrderCreated?.();
    } catch (err) {
      setError(err.message || 'Erreur lors de la confirmation de la commande');
    }
  };

  const handleCancelOrder = async (orderId) => {
    setError('');
    try {
      await api.cancelOrder(orderId);
      setSelectedOrderIds((prev) => prev.filter((id) => id !== orderId));
      const orderToCancel = orders.find((o) => o.id === orderId);
      if (orderToCancel?.exchanges) {
        const exIds = orderToCancel.exchanges.map((e) => e.id);
        setSelectedExchangeIds((prev) => prev.filter((id) => !exIds.includes(id)));
      }
      if (orderToCancel?.refunds) {
        const refIds = orderToCancel.refunds.map((r) => r.id);
        setSelectedRefundIds((prev) => prev.filter((id) => !refIds.includes(id)));
      }
      loadOrders();
      onOrderCreated?.();
    } catch (err) {
      setError(err.message || "Erreur lors de l'annulation de la commande");
    }
  };

  const handleRefundOrder = async (orderId, paymentResponsibility = 'customer_paid') => {
    setError('');
    try {
      await api.refundOrder(orderId, { paymentResponsibility });
      setSelectedOrderIds((prev) => prev.filter((id) => id !== orderId));
      const orderToRefund = orders.find((o) => o.id === orderId);
      if (orderToRefund?.exchanges) {
        const exIds = orderToRefund.exchanges.map((e) => e.id);
        setSelectedExchangeIds((prev) => prev.filter((id) => !exIds.includes(id)));
      }
      if (orderToRefund?.refunds) {
        const refIds = orderToRefund.refunds.map((r) => r.id);
        setSelectedRefundIds((prev) => prev.filter((id) => !refIds.includes(id)));
      }
      loadOrders();
      onOrderCreated?.();
    } catch (err) {
      setError(err.message || "Erreur lors du remboursement de la commande");
    }
  };

  const handleManualOrderSuccess = () => {
    loadOrders();
    onOrderCreated?.();
  };

  const renderStatusBadge = (status) => {
    if (status === 'completed' || status === 'confirmed') {
      return <span className="admin-status-badge confirmed">Confirmée</span>;
    }
    if (status === 'exchanged') {
      return <span className="admin-status-badge exchanged">Echangée</span>;
    }
    if (status === 'refunded') {
      return <span className="admin-status-badge refunded">Remboursée</span>;
    }
    if (status === 'cancelled') {
      return <span className="admin-status-badge cancelled">Annulée</span>;
    }
    return <span className="admin-status-badge unconfirmed">Non Confirmée</span>;
  };

  if (loading) return <p className="admin-loading">Chargement des commandes...</p>;

  return (
    <section className="admin-panel admin-orders-panel">
      {/* Top Header Bar */}
      <div className="admin-panel-header admin-orders-header">
        <div className="admin-panel-title-area">
          <h2>Commandes</h2>
          {filteredOrders.length > 0 && (
            <span className="admin-draft-count-badge">
              {filteredOrders.length} commande{filteredOrders.length > 1 ? 's' : ''}
            </span>
          )}
          {paginatedOrders.length > 0 && (
            <label className="admin-toolbar-select">
              <input
                type="checkbox"
                checked={isAllPageSelected}
                ref={(input) => {
                  if (input) {
                    input.indeterminate = isSomePageSelected;
                  }
                }}
                onChange={toggleSelectPage}
                aria-label="Tout sélectionner sur la page"
              />
              <span>Tout sélectionner</span>
            </label>
          )}
        </div>
        <div className="admin-panel-actions">
          <button
            type="button"
            className="admin-print-toolbar-btn"
            disabled={totalSelectedCount === 0}
            onClick={handlePrintSelected}
            title={`Imprimer${totalSelectedCount > 0 ? ` (${totalSelectedCount})` : ''}`}
            aria-label={`Imprimer ${totalSelectedCount} commande(s) sélectionnée(s)`}
          >
            <img alt="" className="admin-btn-icon" src="/pictures/printer.png" />
          </button>
          <button
            type="button"
            className="admin-download-btn"
            disabled={!canConfirm || downloading}
            onClick={handleDownloadSelected}
          >
            <img src="/pictures/confirm.png" alt="" className="admin-btn-icon" style={{ filter: 'none' }} />
            <span>
              {downloading
                ? 'Confirmation...'
                : `Confirmer${totalSelectedCount > 0 ? ` (${totalSelectedCount})` : ''}`}
            </span>
          </button>
          <button type="button" className="admin-primary-btn" onClick={() => setManualOrderOpen(true)}>
            <img src="/pictures/addorder.png" alt="" className="admin-btn-icon" />
            <span>Créer une commande</span>
          </button>
          <button type="button" className="admin-secondary-btn" onClick={() => loadOrders()}>
            Actualiser
          </button>
        </div>
      </div>

      {/* Search Bar + Status Filter */}
      <div className="admin-orders-controls-bar">
        <div className="admin-orders-search-wrapper">
          <input
            type="text"
            className="admin-orders-search-input"
            placeholder="Rechercher par N° commande, nom client, téléphone, email..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
          />
          {searchQuery && (
            <button
              type="button"
              className="admin-search-clear-btn"
              onClick={() => {
                setSearchQuery('');
                setCurrentPage(1);
              }}
              title="Effacer la recherche"
              aria-label="Effacer la recherche"
            >
              ×
            </button>
          )}
        </div>

        <div className="admin-orders-filter-wrapper">
          <select
            className="admin-orders-status-select"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setCurrentPage(1);
            }}
            aria-label="Filtrer par statut"
          >
            <option value="all">Tous les statuts</option>
            <option value="unconfirmed">Non Confirmée</option>
            <option value="confirmed">Confirmée</option>
            <option value="exchanged">Échangée</option>
            <option value="refunded">Remboursée</option>
            <option value="cancelled">Annulée</option>
          </select>
        </div>
      </div>

      <AdminManualOrderModal
        open={manualOrderOpen}
        onClose={() => setManualOrderOpen(false)}
        onSuccess={handleManualOrderSuccess}
      />

      <AdminExchangeModal
        open={Boolean(exchangeModalOrder)}
        order={exchangeModalOrder?.order || exchangeModalOrder}
        paymentResponsibility={exchangeModalOrder?.paymentResponsibility || 'customer_paid'}
        onClose={() => setExchangeModalOrder(null)}
        onSuccess={() => {
          loadOrders();
          onOrderCreated?.();
        }}
      />

      {error && <p className="admin-error" style={{ marginBottom: '16px' }}>{error}</p>}

      {orders.length === 0 ? (
        <p className="admin-empty">Aucune commande pour le moment.</p>
      ) : filteredOrders.length === 0 ? (
        <p className="admin-empty">
          {searchQuery
            ? `Aucune commande ne correspond à votre recherche "${searchQuery}".`
            : 'Aucune commande ne correspond au filtre sélectionné.'}
        </p>
      ) : (
        <>
          {/* Main Orders Table */}
          <div className="admin-orders-table-wrap">
            <table className="admin-orders-table">
              <thead>
                <tr>
                  <th className="admin-table-th col-select">
                    <input
                      type="checkbox"
                      checked={isAllPageSelected}
                      ref={(input) => {
                        if (input) {
                          input.indeterminate = isSomePageSelected;
                        }
                      }}
                      onChange={toggleSelectPage}
                      aria-label="Sélectionner toutes les commandes de la page"
                    />
                  </th>
                  <th className="admin-table-th col-date sortable" onClick={toggleDateSort} title="Inverser le tri par date">
                    <div className="admin-th-content">
                      <img src="/pictures/timeanddate.png" alt="" className="admin-th-icon" />
                      <span>Date et Heure</span>
                      <span className="admin-sort-indicator">{sortDirection === 'desc' ? '▼' : '▲'}</span>
                    </div>
                  </th>
                  <th className="admin-table-th col-id">
                    <div className="admin-th-content">
                      <img src="/pictures/orderid.png" alt="" className="admin-th-icon" />
                      <span>ID de la commande</span>
                    </div>
                  </th>
                  <th className="admin-table-th col-client">
                    <div className="admin-th-content">
                      <img src="/pictures/clientname.png" alt="" className="admin-th-icon" />
                      <span>Nom Client</span>
                    </div>
                  </th>
                  <th className="admin-table-th col-phone">
                    <div className="admin-th-content">
                      <img src="/pictures/phonenumber.png" alt="" className="admin-th-icon" />
                      <span>Téléphone</span>
                    </div>
                  </th>
                  <th className="admin-table-th col-status">
                    <div className="admin-th-content">
                      <img src="/pictures/statusflag.png" alt="" className="admin-th-icon" />
                      <span>Status</span>
                    </div>
                  </th>
                  <th className="admin-table-th col-price">
                    <div className="admin-th-content">
                      <img src="/pictures/money.png" alt="" className="admin-th-icon" />
                      <span>Prix</span>
                    </div>
                  </th>
                  <th className="admin-table-th col-actions">
                    <div className="admin-th-content admin-th-actions">
                      <img src="/pictures/actions.png" alt="" className="admin-th-icon" />
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginatedOrders.map((order) => {
                  const isCancelled = order.status === 'cancelled';
                  const isRefunded = order.status === 'refunded';
                  const isUnconfirmed = order.status === 'pending' || order.status === 'processing';
                  const canExchange = order.status === 'completed' || order.status === 'confirmed' || order.status === 'exchanged';
                  const isSelected = selectedOrderIds.includes(order.id);
                  const isExpanded = expandedOrderIds.includes(order.id);
                  const payableAmount =
                    order.customerAmountToPay !== undefined
                      ? order.customerAmountToPay
                      : (order.finalCustomerPayableAmount !== undefined ? order.finalCustomerPayableAmount : order.total);

                  return (
                    <Fragment key={order.id}>
                      <tr
                        id={`order-${order.id}`}
                        className={`admin-order-row ${isCancelled ? 'is-cancelled' : ''} ${isRefunded ? 'is-refunded' : ''} ${activeHighlightId === order.id ? 'notification-highlight' : ''}`}
                      >
                        {/* Column 0: Checkbox */}
                        <td className="admin-table-td col-select">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectOrder(order.id)}
                            aria-label={`Sélectionner commande ${order.orderNumber}`}
                          />
                        </td>

                        {/* Column 1: Date et Heure */}
                        <td className="admin-table-td col-date">
                          <span className="admin-table-cell-date">
                            {order.createdAt ? new Date(order.createdAt).toLocaleString('fr-FR') : '—'}
                          </span>
                        </td>

                        {/* Column 2: ID de la commande */}
                        <td className="admin-table-td col-id">
                          <strong className="admin-table-cell-id">{order.orderNumber}</strong>
                        </td>

                        {/* Column 3: Nom Client */}
                        <td className="admin-table-td col-client">
                          <span className="admin-table-cell-client">
                            {order.customer?.firstName || order.customer?.name || ''} {order.customer?.lastName || ''}
                          </span>
                        </td>

                        {/* Column 4: Téléphone */}
                        <td className="admin-table-td col-phone">
                          <span className="admin-table-cell-phone">
                            {order.customer?.phone || '—'}
                          </span>
                        </td>

                        {/* Column 5: Status */}
                        <td className="admin-table-td col-status">
                          {renderStatusBadge(order.status)}
                        </td>

                        {/* Column 6: Prix (Montant à payer) */}
                        <td className="admin-table-td col-price">
                          <strong className="admin-table-cell-price">{formatPrice(payableAmount)}</strong>
                        </td>

                        {/* Column 7: Actions */}
                        <td className="admin-table-td col-actions">
                          <div className="admin-table-actions-cell">
                            <button
                              type="button"
                              className="admin-icon-action-btn admin-btn-print"
                              onClick={() => handlePrintOrder(order)}
                              aria-label={`Imprimer commande ${order.orderNumber}`}
                            >
                              <img alt="" className="admin-btn-icon" src="/pictures/printer.png" />
                              <span className="admin-tooltip">Imprimer</span>
                            </button>
                            <div className="admin-order-actions-cluster">
                              <div className="admin-actions-row admin-actions-row-top">
                                <button
                                  type="button"
                                  className="admin-icon-action-btn admin-btn-details"
                                  onClick={() => toggleExpand(order.id)}
                                  aria-label={isExpanded ? 'Masquer' : 'Détails'}
                                >
                                  <img alt="" className="admin-btn-icon" src="/pictures/history.png" />
                                  <span className="admin-tooltip">Détails</span>
                                </button>
                                {isUnconfirmed && (
                                  <button
                                    type="button"
                                    className="admin-icon-action-btn admin-btn-confirm"
                                    onClick={() => handleConfirmSingleOrder(order)}
                                    aria-label="Confirmer commande"
                                  >
                                    <img alt="" className="admin-btn-icon" src="/pictures/confirm.png" />
                                    <span className="admin-tooltip">Confirmer</span>
                                  </button>
                                )}
                                {canExchange && (
                                  <button
                                    type="button"
                                    className="admin-icon-action-btn admin-btn-exchange"
                                    onClick={() => setExchangeModalOrder({ order, paymentResponsibility: 'customer_paid' })}
                                    aria-label="Échange"
                                  >
                                    <img alt="" className="admin-btn-icon" src="/pictures/exchange.png" />
                                    <span className="admin-tooltip">Échange</span>
                                  </button>
                                )}
                                {!isCancelled && !isRefunded && !isUnconfirmed && (
                                  <button
                                    type="button"
                                    className="admin-icon-action-btn admin-btn-refund"
                                    onClick={() => handleRefundOrder(order.id, 'customer_paid')}
                                    aria-label="Remboursement"
                                  >
                                    <img alt="" className="admin-btn-icon" src="/pictures/refund.png" />
                                    <span className="admin-tooltip">Remboursement</span>
                                  </button>
                                )}
                                {!isCancelled && !isRefunded && (
                                  <button
                                    type="button"
                                    className="admin-icon-action-btn admin-btn-cancel"
                                    onClick={() => handleCancelOrder(order.id)}
                                    aria-label="Annuler"
                                  >
                                    <img alt="" className="admin-btn-icon" src="/pictures/cancel.png" />
                                    <span className="admin-tooltip">Annuler</span>
                                  </button>
                                )}
                              </div>
                              {(canExchange || (!isCancelled && !isRefunded && !isUnconfirmed)) && (
                                <div className="admin-actions-row admin-actions-row-bottom">
                                  {canExchange && (
                                    <button
                                      type="button"
                                      className="admin-icon-action-btn admin-btn-exchange-paid"
                                      onClick={() => setExchangeModalOrder({ order, paymentResponsibility: 'silky_paid' })}
                                      aria-label="Échange payé"
                                    >
                                      <img alt="" className="admin-btn-icon" src="/pictures/exchangesilky.png" />
                                      <span className="admin-tooltip">Échange payé</span>
                                    </button>
                                  )}
                                  {!isCancelled && !isRefunded && !isUnconfirmed && (
                                    <button
                                      type="button"
                                      className="admin-icon-action-btn admin-btn-refund-free"
                                      onClick={() => handleRefundOrder(order.id, 'silky_paid')}
                                      aria-label="Remboursement gratuit"
                                    >
                                      <img alt="" className="admin-btn-icon" src="/pictures/refundsilky.png" />
                                      <span className="admin-tooltip">Remboursement gratuit</span>
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>

                      {/* Expanded Row Rendering directly below its order */}
                      {isExpanded && (
                        <tr className="admin-order-expanded-row">
                          <td colSpan={8} className="admin-order-expanded-cell">
                            <div className="admin-order-details">
                              <div className="admin-expanded-header-info">
                                <p>
                                  <strong>Client:</strong> {order.customer?.firstName || order.customer?.name || ''} {order.customer?.lastName || ''}
                                </p>
                                <p>
                                  <strong>Email:</strong> {order.customer?.email || 'Non renseigné'}
                                </p>
                                <p>
                                  <strong>Téléphone:</strong> {order.customer?.phone || 'Non renseigné'}
                                </p>
                                <p>
                                  <strong>Adresse:</strong> {order.customer?.address || 'Non renseignée'}
                                </p>
                              </div>

                              <div className="admin-expanded-items-section">
                                <strong>Articles commandés :</strong>
                                <ul className="admin-order-items-list">
                                  {order.items?.map((item, i) => (
                                    <li key={i}>
                                      <strong>{item.name || item.productTitle}</strong>
                                      {item.details || item.variantLabel ? ` (${item.details || item.variantLabel})` : ''} × {item.quantity} — {formatPrice((item.price || item.unitPrice || 0) * item.quantity)}
                                    </li>
                                  ))}
                                </ul>
                              </div>

                              <div className="admin-expanded-financials">
                                <p>
                                  <strong>Total:</strong> {formatPrice(order.total)} (livraison: {formatPrice(order.deliveryFee)})
                                </p>
                                <p>
                                  <strong>Montant à payer:</strong> {formatPrice(payableAmount)}
                                </p>
                              </div>

                              {/* Historical Exchanges inside Table */}
                              {order.exchanges && order.exchanges.length > 0 && (
                                <div className="admin-order-exchanges-history">
                                  <h4 className="admin-exchanges-title">Historique des Échanges ({order.exchanges.length})</h4>
                                  <div className="admin-history-subtable-wrap">
                                    <table className="admin-history-subtable">
                                      <thead>
                                        <tr>
                                          <th className="col-sub-select"></th>
                                          <th className="col-sub-date">Date et Heure</th>
                                          <th className="col-sub-id">ID Échange</th>
                                          <th className="col-sub-client">Client</th>
                                          <th className="col-sub-phone">Téléphone</th>
                                          <th className="col-sub-status">Type</th>
                                          <th className="col-sub-price">Montant à payer</th>
                                          <th className="col-sub-details">Détails</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {order.exchanges.map((ex, idx) => {
                                          const exPayable =
                                            ex.customerAmountToPay !== undefined
                                              ? ex.customerAmountToPay
                                              : (ex.finalCustomerPayableAmount !== undefined ? ex.finalCustomerPayableAmount : ex.total);
                                          const isExSelected = selectedExchangeIds.includes(ex.id);

                                          return (
                                            <tr key={ex.id || idx} className="admin-history-row">
                                              <td className="col-sub-select">
                                                <input
                                                  type="checkbox"
                                                  checked={isExSelected}
                                                  onChange={() => toggleSelectExchange(ex.id)}
                                                  aria-label={`Sélectionner échange ${ex.exchangeNumber}`}
                                                />
                                              </td>
                                              <td className="col-sub-date">
                                                {ex.createdAt ? new Date(ex.createdAt).toLocaleString('fr-FR') : '—'}
                                              </td>
                                              <td className="col-sub-id">
                                                <strong>Échange #{ex.exchangeSequence || idx + 1} — {ex.exchangeNumber}</strong>
                                              </td>
                                              <td className="col-sub-client">
                                                {ex.customer?.name || `${ex.customer?.firstName || ''} ${ex.customer?.lastName || ''}`.trim() || '—'}
                                              </td>
                                              <td className="col-sub-phone">
                                                {ex.customer?.phone || '—'}
                                              </td>
                                              <td className="col-sub-status">
                                                <span className={`admin-status-badge ${ex.paymentResponsibility === 'silky_paid' ? 'confirmed' : 'exchanged'}`}>
                                                  {ex.paymentResponsibility === 'silky_paid' ? 'Silky payé' : 'Client payé'}
                                                </span>
                                              </td>
                                              <td className="col-sub-price">
                                                <strong>{formatPrice(exPayable)}</strong>
                                              </td>
                                              <td className="col-sub-details">
                                                <div className="admin-history-item-desc">
                                                  <span>Total Échange: {formatPrice(ex.total)} (livraison: {formatPrice(ex.deliveryFee)})</span>
                                                  <ul className="admin-exchange-items">
                                                    {ex.items?.map((item, itemIdx) => (
                                                      <li key={itemIdx}>
                                                        {item.name || item.productTitle} × {item.quantity} — {formatPrice((item.price || item.unitPrice || 0) * item.quantity)}
                                                      </li>
                                                    ))}
                                                  </ul>
                                                </div>
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              )}

                              {/* Historical Refunds inside Table */}
                              {order.refunds && order.refunds.length > 0 && (
                                <div className="admin-order-refunds-history">
                                  <h4 className="admin-refunds-title">Historique des Remboursements ({order.refunds.length})</h4>
                                  <div className="admin-history-subtable-wrap">
                                    <table className="admin-history-subtable">
                                      <thead>
                                        <tr>
                                          <th className="col-sub-select"></th>
                                          <th className="col-sub-date">Date et Heure</th>
                                          <th className="col-sub-id">ID Remboursement</th>
                                          <th className="col-sub-client">Client</th>
                                          <th className="col-sub-phone">Téléphone</th>
                                          <th className="col-sub-status">Type</th>
                                          <th className="col-sub-price">Montant à payer</th>
                                          <th className="col-sub-details">Détails</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {order.refunds.map((ref, idx) => {
                                          const isSilkyPaid = ref.paymentResponsibility === 'silky_paid' || Number(ref.deliveryFee) === 0;
                                          const refPayable =
                                            ref.customerAmountToPay !== undefined
                                              ? ref.customerAmountToPay
                                              : (ref.finalCustomerPayableAmount !== undefined ? ref.finalCustomerPayableAmount : 0);
                                          const isRefSelected = selectedRefundIds.includes(ref.id);

                                          return (
                                            <tr key={ref.id || idx} className="admin-history-row">
                                              <td className="col-sub-select">
                                                <input
                                                  type="checkbox"
                                                  checked={isRefSelected}
                                                  onChange={() => toggleSelectRefund(ref.id)}
                                                  aria-label={`Sélectionner remboursement ${ref.refundNumber}`}
                                                />
                                              </td>
                                              <td className="col-sub-date">
                                                {ref.createdAt ? new Date(ref.createdAt).toLocaleString('fr-FR') : '—'}
                                              </td>
                                              <td className="col-sub-id">
                                                <strong>Remboursement #{idx + 1} — {ref.refundNumber}</strong>
                                              </td>
                                              <td className="col-sub-client">
                                                {ref.customer?.name || '—'}
                                              </td>
                                              <td className="col-sub-phone">
                                                {ref.customer?.phone || '—'}
                                              </td>
                                              <td className="col-sub-status">
                                                <span className={`admin-status-badge ${isSilkyPaid ? 'confirmed' : 'refunded'}`}>
                                                  {isSilkyPaid ? 'Silky gratuit' : 'Client payé'}
                                                </span>
                                              </td>
                                              <td className="col-sub-price">
                                                <strong>{formatPrice(refPayable)}</strong>
                                              </td>
                                              <td className="col-sub-details">
                                                <div className="admin-history-item-desc">
                                                  <span>
                                                    Montant remboursé: {formatPrice(ref.refundAmount)} (
                                                    {isSilkyPaid
                                                      ? 'Frais retour client: 0,000 TND — Silky absorbe 7,000 TND'
                                                      : `Frais retour payés par client: ${formatPrice(ref.deliveryFee)}`}
                                                    )
                                                  </span>
                                                  <ul className="admin-refund-items">
                                                    {ref.items?.map((item, itemIdx) => (
                                                      <li key={itemIdx}>
                                                        {item.name || item.productTitle} × {item.quantity} — {formatPrice((item.price || item.unitPrice || 0) * item.quantity)}
                                                      </li>
                                                    ))}
                                                  </ul>
                                                </div>
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination Bar */}
          <div className="admin-orders-pagination-bar">
            <div className="admin-pagination-summary">
              Showing {totalOrders === 0 ? 0 : startIndex + 1}–{endIndex} of {totalOrders} orders
            </div>

            <div className="admin-pagination-right">
              <div className="admin-pagination-page-size">
                <select
                  id="admin-page-size-select"
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="admin-page-size-select"
                  aria-label="Sélectionner le nombre de commandes par page"
                >
                  <option value={20}>20 per page</option>
                  <option value={50}>50 per page</option>
                  <option value={100}>100 per page</option>
                  <option value={500}>500 per page</option>
                </select>
              </div>

              <div className="admin-pagination-nav">
                <button
                  type="button"
                  className="admin-pagination-btn"
                  disabled={activePage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  aria-label="Page précédente"
                >
                  Previous
                </button>

                {getPageNumbers(activePage, totalPages).map((p, idx) =>
                  p === '...' ? (
                    <span key={`ellipsis-${idx}`} className="admin-pagination-ellipsis">
                      …
                    </span>
                  ) : (
                    <button
                      key={p}
                      type="button"
                      className={`admin-pagination-btn ${p === activePage ? 'active' : ''}`}
                      onClick={() => setCurrentPage(p)}
                      aria-label={`Page ${p}`}
                    >
                      {p}
                    </button>
                  ),
                )}

                <button
                  type="button"
                  className="admin-pagination-btn"
                  disabled={activePage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  aria-label="Page suivante"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
