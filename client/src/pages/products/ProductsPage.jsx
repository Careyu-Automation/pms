import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Grid2x2, LayoutGrid, List, Package, Plus } from 'lucide-react';
import { ProductForm } from '../../components/products/ProductForm';
import { PRODUCT_PRIORITY, PRODUCT_STATUS, blankProduct, productToForm, validateProduct, withCurrentLead } from '../../components/products/productModel';
import { PageContainer, PageContent } from '../../components/layout/PageContainer';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { Modal } from '../../components/ui/Modal';
import { PageHeader } from '../../components/ui/PageHeader';
import { useToast } from '../../context/ToastContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { usePageMeta } from '../../hooks/usePageMeta';
import { createProduct, deleteProduct, listProducts, updateProduct } from '../../services/products.service';
import { formatDate } from '../../utils/format';
import '../../styles/lead.css';
import '../../styles/products.css';

const VIEWS = [
  ['cards', 'Cards', LayoutGrid],
  ['list', 'List', List],
  ['tiles', 'Tiles', Grid2x2],
];

function failureMessage(error, fallback) {
  console.error(fallback, error);
  if (error.status === 401) return 'Your session has expired. Please sign in again.';
  if (error.status === 403) return error.message || 'You do not have permission to change products.';
  if (error.status === 400 || error.status === 409) return error.message;
  if (!error.status || error.status >= 500) return fallback;
  return error.message || fallback;
}

function ProductsEmptyState() {
  return (
    <EmptyState
      icon={Package}
      title="No products yet"
      description="Add a product to track internal development work."
    />
  );
}

function ProductFacts({ product }) {
  const status = PRODUCT_STATUS[product.status] || product.status;
  const priority = PRODUCT_PRIORITY[product.priority] || product.priority;
  return (
    <>
      <span className="products-code">{product.productCode}</span>
      <div className="products-pills">
        <Badge tone={product.status === 'ACTIVE' ? 'progress' : product.status === 'COMPLETED' ? 'completed' : product.status === 'ON_HOLD' ? 'hold' : 'neutral'}>{status}</Badge>
        <Badge tone={product.priority === 'HIGH' || product.priority === 'CRITICAL' ? 'danger' : product.priority === 'MEDIUM' ? 'warning' : 'neutral'}>{priority}</Badge>
      </div>
      <span>{product.teamName || 'No team'}</span>
      {product.department ? <span>{product.department}</span> : null}
      <span>Start: {formatDate(product.startDate)}</span>
      <span>End: {formatDate(product.endDate)}</span>
      <span>{product.leadCode ? `Lead: ${product.leadCode}` : 'Internal Product'}</span>
    </>
  );
}

function ProductActions({ access, onEdit, onDelete }) {
  if (!access.canEdit && !access.canDelete) return null;
  return (
    <div className="products-actions" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
      {access.canEdit ? <Button size="sm" variant="secondary" onClick={onEdit}>Edit</Button> : null}
      {access.canDelete ? <Button size="sm" variant="danger" onClick={onDelete}>Delete</Button> : null}
    </div>
  );
}

export default function ProductsPage() {
  const meta = usePageMeta();
  useDocumentTitle(meta.title);
  const navigate = useNavigate();
  const { push } = useToast();
  const [viewMode, setViewMode] = useState('cards');
  const [products, setProducts] = useState([]);
  const [teams, setTeams] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [leads, setLeads] = useState([]);
  const [access, setAccess] = useState({ canCreate: false, canEdit: false, canDelete: false });
  const [status, setStatus] = useState('loading');
  const [editor, setEditor] = useState(null);
  const [form, setForm] = useState(blankProduct);
  const [serverErrors, setServerErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);

  const load = useCallback(() => {
    setStatus('loading');
    return listProducts()
      .then((payload) => {
        setProducts(payload.data.products || []);
        setTeams(payload.data.teams || []);
        setDepartments(payload.data.departments || []);
        setLeads(payload.data.leads || []);
        setAccess(payload.data.access || { canCreate: false, canEdit: false, canDelete: false });
        setStatus('ready');
      })
      .catch((error) => {
        setStatus('error');
        push({ tone: 'danger', message: error.message });
      });
  }, [push]);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setServerErrors({});
    setForm(blankProduct());
    setEditor('create');
  }

  function openEdit(product) {
    setServerErrors({});
    setForm(productToForm(product));
    setEditor(product);
  }

  async function submit(event) {
    event.preventDefault();
    const errors = validateProduct(form);
    if (Object.keys(errors).length || busy) return;
    setBusy(true);
    setServerErrors({});
    try {
      const payload = editor === 'create'
        ? await createProduct(form)
        : await updateProduct(editor.id, form);
      const product = payload.data.product;
      setProducts((current) => (
        editor === 'create'
          ? [product, ...current]
          : current.map((item) => (item.id === product.id ? product : item))
      ));
      setEditor(null);
      push({ tone: 'success', message: editor === 'create' ? 'Product created successfully.' : 'Product updated.' });
    } catch (error) {
      const message = failureMessage(error, editor === 'create' ? 'Unable to create product. Please try again.' : 'Unable to update product. Please try again.');
      if (error.details?.fields) setServerErrors(error.details.fields);
      push({ tone: 'danger', message });
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete || busy) return;
    setBusy(true);
    try {
      await deleteProduct(pendingDelete.id);
      setProducts((current) => current.filter((item) => item.id !== pendingDelete.id));
      setPendingDelete(null);
      push({ tone: 'success', message: 'Product deleted.' });
    } catch (error) {
      push({ tone: 'danger', message: failureMessage(error, 'Unable to delete product. Please try again.') });
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageContainer>
      <PageHeader title={meta.title} description={meta.description} />
      <div className="products-toolbar">
        <div className="products-views" role="tablist" aria-label="Product view">
          {VIEWS.map(([id, label, Icon]) => (
            <button key={id} type="button" role="tab" aria-selected={viewMode === id} className={viewMode === id ? 'is-active' : ''} onClick={() => setViewMode(id)}>
              <Icon size={16} aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
        {access.canCreate ? <Button onClick={openCreate}><Plus size={16} /> New Product</Button> : null}
      </div>

      {status === 'loading' ? <div className="products-skeleton" aria-hidden="true" /> : null}
      {status === 'error' ? <ErrorState title="Products could not be loaded." action={<Button onClick={load}>Retry</Button>} /> : null}
      {status === 'ready' && !products.length ? (
        <PageContent>
          <ProductsEmptyState />
        </PageContent>
      ) : null}
      {status === 'ready' && products.length && viewMode === 'cards' ? (
        <div className="products-cards">
          {products.map((product) => (
            <article key={product.id} className="products-card" role="link" tabIndex={0} onClick={() => navigate(`/products/${product.id}`)} onKeyDown={(event) => { if (event.key === 'Enter') navigate(`/products/${product.id}`); }}>
              <h2>{product.name}</h2>
              <ProductFacts product={product} />
              {product.description ? <p>{product.description}</p> : null}
              <ProductActions access={access} onEdit={() => openEdit(product)} onDelete={() => setPendingDelete(product)} />
            </article>
          ))}
        </div>
      ) : null}
      {status === 'ready' && products.length && viewMode === 'tiles' ? (
        <div className="products-tiles">
          {products.map((product) => (
            <article key={product.id} className="products-tile" role="link" tabIndex={0} onClick={() => navigate(`/products/${product.id}`)} onKeyDown={(event) => { if (event.key === 'Enter') navigate(`/products/${product.id}`); }}>
              <strong>{product.name}</strong>
              <ProductFacts product={product} />
              <ProductActions access={access} onEdit={() => openEdit(product)} onDelete={() => setPendingDelete(product)} />
            </article>
          ))}
        </div>
      ) : null}
      {status === 'ready' && products.length && viewMode === 'list' ? (
        <div className="products-table-scroll">
          <table className="data-table products-table">
            <thead>
              <tr>
                <th>Product</th><th>Code</th><th>Status</th><th>Priority</th><th>Team</th><th>Department</th><th>Start</th><th>End</th><th>Lead</th><th />
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr key={product.id} className="is-clickable" onClick={() => navigate(`/products/${product.id}`)}>
                  <td>{product.name}</td>
                  <td>{product.productCode}</td>
                  <td>{PRODUCT_STATUS[product.status] || product.status}</td>
                  <td>{PRODUCT_PRIORITY[product.priority] || product.priority}</td>
                  <td>{product.teamName}</td>
                  <td>{product.department || '—'}</td>
                  <td>{formatDate(product.startDate)}</td>
                  <td>{formatDate(product.endDate)}</td>
                  <td>{product.leadCode || 'Internal Product'}</td>
                  <td onClick={(event) => event.stopPropagation()}>
                    <ProductActions access={access} onEdit={() => openEdit(product)} onDelete={() => setPendingDelete(product)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <Modal open={Boolean(editor)} className="products-dialog" title={editor === 'create' ? 'New Product' : 'Edit Product'} onClose={() => { if (!busy) setEditor(null); }}>
        {editor ? (
          <ProductForm
            mode={editor === 'create' ? 'create' : 'edit'}
            form={form}
            setForm={(value) => {
              setServerErrors({});
              setForm(value);
            }}
            teams={teams}
            departments={departments}
            leads={withCurrentLead(leads, editor)}
            serverErrors={serverErrors}
            busy={busy}
            onCancel={() => setEditor(null)}
            onSubmit={submit}
          />
        ) : null}
      </Modal>
      <Modal open={Boolean(pendingDelete)} title="Delete Product?" onClose={() => { if (!busy) setPendingDelete(null); }}>
        <p>Are you sure you want to delete this product?</p>
        <div className="products-form__actions">
          <Button variant="secondary" onClick={() => setPendingDelete(null)} disabled={busy}>Cancel</Button>
          <Button variant="danger" onClick={confirmDelete} loading={busy}>Delete Product</Button>
        </div>
      </Modal>
    </PageContainer>
  );
}
