/**
 * Provides lifecycle-safe auction configuration management in the Laravel admin shell.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
    ApiClientError,
    cancelAuction,
    createAuction,
    deleteAuction,
    getAuction,
    getAuctions,
    updateAuction,
} from '../api';
import type {
    AuctionDetail,
    AuctionSummary,
    CreateAuctionRequest,
    SaleMode,
    UpdateAuctionRequest,
} from '../types';
import { formatMoney } from '../app/utils/auction';
import {
    appearsEditable,
    appearsCancellable,
    describeManagementError,
    localInputToUtc,
    type AuctionFormState,
    utcToLocalInput,
    validateAuctionForm,
} from './auctionManagement';

type ManagementMode = 'list' | 'create' | 'edit';

const saleModes: Array<{ value: SaleMode; label: string }> = [
    { value: 'AuctionOnly', label: 'Auction only' },
    { value: 'BuyNowOnly', label: 'Buy Now only' },
    { value: 'AuctionAndBuyNow', label: 'Auction + Buy Now' },
];

function initialForm(): AuctionFormState {
    const now = new Date();
    const start = new Date(now.getTime() + 60 * 60_000);
    const end = new Date(now.getTime() + 25 * 60 * 60_000);

    return {
        title: '',
        description: '',
        saleMode: 'AuctionOnly',
        startingPrice: 100,
        minimumBidIncrement: 10,
        buyNowPrice: null,
        startTimeLocal: utcToLocalInput(start.toISOString()),
        endTimeLocal: utcToLocalInput(end.toISOString()),
    };
}

function formFromAuction(auction: AuctionDetail): AuctionFormState {
    return {
        id: auction.id,
        title: auction.title,
        description: auction.description,
        saleMode: auction.saleMode,
        startingPrice: auction.startingPrice,
        minimumBidIncrement: auction.minimumBidIncrement,
        buyNowPrice: auction.buyNowPrice,
        startTimeLocal: utcToLocalInput(auction.startTimeUtc),
        endTimeLocal: utcToLocalInput(auction.endTimeUtc),
        version: auction.version,
    };
}

function errorMessage(error: unknown) {
    if (error instanceof ApiClientError) {
        return describeManagementError(error.error.code, error.error.message);
    }

    return error instanceof Error ? error.message : 'Auction management request failed.';
}

function toCreateRequest(form: AuctionFormState): CreateAuctionRequest {
    const buyNowPrice = form.saleMode === 'AuctionOnly' ? null : form.buyNowPrice;

    return {
        title: form.title.trim(),
        description: form.description.trim(),
        saleMode: form.saleMode,
        startingPrice: form.saleMode === 'BuyNowOnly' ? (buyNowPrice ?? 0) : form.startingPrice,
        minimumBidIncrement: form.minimumBidIncrement || 1,
        buyNowPrice,
        startTimeUtc: localInputToUtc(form.startTimeLocal),
        endTimeUtc: localInputToUtc(form.endTimeLocal),
    };
}

function toUpdateRequest(form: AuctionFormState): UpdateAuctionRequest {
    return { ...toCreateRequest(form), version: form.version ?? 0 };
}

/** Renders authoritative Bidding Service auction management inside the Laravel admin shell. */
export function AuctionManagementPage() {
    const [auctions, setAuctions] = useState<AuctionSummary[]>([]);
    const [mode, setMode] = useState<ManagementMode>('list');
    const [form, setForm] = useState<AuctionFormState>(initialForm);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const [validation, setValidation] = useState<Record<string, string>>({});

    async function refresh() {
        setLoading(true);
        try {
            setAuctions(await getAuctions());
            setError(null);
        } catch (refreshError) {
            setError(errorMessage(refreshError));
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        void refresh();
    }, []);

    const editableCount = useMemo(
        () => auctions.filter((auction) => appearsEditable(auction)).length,
        [auctions],
    );

    async function beginEdit(id: string) {
        setBusy(true);
        setError(null);
        try {
            const auction = await getAuction(id);
            if (!appearsEditable(auction)) {
                setError('Only an untouched future Scheduled auction can be edited.');
                await refresh();
                return;
            }
            setForm(formFromAuction(auction));
            setMode('edit');
        } catch (editError) {
            setError(errorMessage(editError));
            await refresh();
        } finally {
            setBusy(false);
        }
    }

    async function submit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const nextValidation = validateAuctionForm(form);
        setValidation(nextValidation);
        setMessage(null);
        if (Object.keys(nextValidation).length > 0) return;

        setBusy(true);
        setError(null);
        try {
            if (mode === 'create') {
                await createAuction(toCreateRequest(form));
                setMessage('Auction created through the Bidding Service.');
            } else if (mode === 'edit') {
                await updateAuction(form.id ?? '', toUpdateRequest(form));
                setMessage('Auction updated through the Bidding Service.');
            }
            await refresh();
            setMode('list');
            setForm(initialForm());
            setValidation({});
        } catch (submitError) {
            setError(errorMessage(submitError));
            if (submitError instanceof ApiClientError && submitError.status === 409) {
                await refresh();
                setMode('list');
            }
        } finally {
            setBusy(false);
        }
    }

    async function remove(auction: AuctionSummary) {
        if (!window.confirm(`Permanently delete auction ${auction.id}? This cannot be undone.`))
            return;

        setBusy(true);
        setError(null);
        try {
            await deleteAuction(auction.id);
            setMessage('Auction deleted.');
            await refresh();
        } catch (deleteError) {
            setError(errorMessage(deleteError));
            await refresh();
        } finally {
            setBusy(false);
        }
    }

    async function cancel(auction: AuctionSummary) {
        const warning =
            auction.currentBidAmount !== null ? ' Existing bid history will be preserved.' : '';
        if (
            !window.confirm(
                `Cancel auction ${auction.id}? It will stop accepting bids and Buy Now purchases, remain in history as Cancelled, and cannot be undone.${warning}`,
            )
        ) {
            return;
        }

        setBusy(true);
        setError(null);
        try {
            await cancelAuction(auction.id, auction.version);
            setMessage('Auction cancelled.');
            await refresh();
        } catch (cancelError) {
            setError(errorMessage(cancelError));
            await refresh();
        } finally {
            setBusy(false);
        }
    }

    if (mode !== 'list') {
        return (
            <AuctionForm
                busy={busy}
                form={form}
                mode={mode}
                onCancel={() => {
                    setMode('list');
                    setValidation({});
                }}
                onChange={setForm}
                onSubmit={submit}
                validation={validation}
            />
        );
    }

    return (
        <section className="admin-panel auction-management-panel">
            <div className="admin-panel-header">
                <div>
                    <h2>Auction management</h2>
                    <p>{editableCount} future Scheduled auction(s) appear editable</p>
                </div>
                <button className="primary-button" onClick={() => setMode('create')} type="button">
                    Create auction
                </button>
            </div>
            <div className="admin-management-note" role="note">
                Configuration is written through the Laravel admin boundary to the authoritative
                Bidding Service API.
            </div>
            {message && (
                <p className="admin-flash" role="status">
                    {message}
                </p>
            )}
            {error && (
                <p className="admin-management-error" role="alert">
                    {error}
                </p>
            )}
            <div aria-busy={loading || busy} className="admin-table-wrap">
                <table className="admin-table auction-management-table">
                    <caption className="sr-only">Auctions available to manage</caption>
                    <thead>
                        <tr>
                            <th scope="col">Auction</th>
                            <th scope="col">Mode / status</th>
                            <th scope="col">Pricing</th>
                            <th scope="col">Window</th>
                            <th scope="col">Version</th>
                            <th scope="col">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {auctions.map((auction) => {
                            const editable = appearsEditable(auction);
                            const cancellable = appearsCancellable(auction);
                            return (
                                <tr key={auction.id}>
                                    <td>
                                        <strong>{auction.title}</strong>
                                        <small>{auction.id}</small>
                                    </td>
                                    <td>
                                        <span className="admin-status">{auction.saleMode}</span>
                                        <small>{auction.status}</small>
                                    </td>
                                    <td>
                                        <small>Start: {formatMoney(auction.startingPrice)}</small>
                                        <small>Buy Now: {formatMoney(auction.buyNowPrice)}</small>
                                    </td>
                                    <td>
                                        <small>{formatDateTime(auction.startTimeUtc)}</small>
                                        <small>{formatDateTime(auction.endTimeUtc)}</small>
                                    </td>
                                    <td>{auction.version}</td>
                                    <td className="admin-action-buttons">
                                        {editable && (
                                            <button
                                                className="admin-secondary-button"
                                                disabled={busy}
                                                onClick={() => void beginEdit(auction.id)}
                                                type="button"
                                            >
                                                Edit
                                            </button>
                                        )}
                                        {editable && (
                                            <button
                                                className="admin-danger-button"
                                                disabled={busy}
                                                onClick={() => void remove(auction)}
                                                type="button"
                                            >
                                                Delete
                                            </button>
                                        )}
                                        {cancellable && (
                                            <button
                                                className="admin-secondary-button"
                                                disabled={busy}
                                                onClick={() => void cancel(auction)}
                                                type="button"
                                            >
                                                Cancel
                                            </button>
                                        )}
                                        {!editable && !cancellable && (
                                            <small>Lifecycle locked</small>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                        {!loading && auctions.length === 0 && (
                            <tr>
                                <td colSpan={6}>No auctions returned by the Bidding Service.</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </section>
    );
}

function formatDateTime(value: string) {
    return new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
    }).format(new Date(value));
}

function AuctionForm({
    busy,
    form,
    mode,
    onCancel,
    onChange,
    onSubmit,
    validation,
}: {
    busy: boolean;
    form: AuctionFormState;
    mode: 'create' | 'edit';
    onCancel: () => void;
    onChange: (form: AuctionFormState) => void;
    onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
    validation: Record<string, string>;
}) {
    const buyNowOnly = form.saleMode === 'BuyNowOnly';
    const showBuyNow = form.saleMode !== 'AuctionOnly';

    return (
        <section className="admin-panel admin-form-panel auction-management-form-panel">
            <div className="admin-panel-header">
                <div>
                    <h2>{mode === 'create' ? 'Create auction' : 'Edit scheduled auction'}</h2>
                    <p>
                        {mode === 'edit'
                            ? `Expected version ${form.version}`
                            : 'Server-owned lifecycle fields are not editable here.'}
                    </p>
                </div>
            </div>
            <form className="admin-form" onSubmit={onSubmit}>
                <AdminField
                    label="Title"
                    name="title"
                    value={form.title}
                    error={validation.title}
                    onChange={(value) => onChange({ ...form, title: value })}
                />
                <label className="admin-field">
                    <span>Description</span>
                    <textarea
                        name="description"
                        onChange={(event) => onChange({ ...form, description: event.target.value })}
                        rows={4}
                        value={form.description}
                    />
                    {validation.description && (
                        <small className="admin-validation">{validation.description}</small>
                    )}
                </label>
                <label className="admin-field">
                    <span>Sale mode</span>
                    <select
                        name="saleMode"
                        onChange={(event) =>
                            onChange({
                                ...form,
                                saleMode: event.target.value as SaleMode,
                                buyNowPrice:
                                    event.target.value === 'AuctionOnly' ? null : form.buyNowPrice,
                            })
                        }
                        value={form.saleMode}
                    >
                        {saleModes.map((saleMode) => (
                            <option key={saleMode.value} value={saleMode.value}>
                                {saleMode.label}
                            </option>
                        ))}
                    </select>
                </label>
                {!buyNowOnly && (
                    <AdminNumberField
                        label="Starting price"
                        value={form.startingPrice}
                        error={validation.startingPrice}
                        onChange={(value) => onChange({ ...form, startingPrice: value })}
                    />
                )}
                <AdminNumberField
                    label={buyNowOnly ? 'Compatibility increment' : 'Minimum bid increment'}
                    value={form.minimumBidIncrement}
                    error={validation.minimumBidIncrement}
                    onChange={(value) => onChange({ ...form, minimumBidIncrement: value })}
                    help={
                        buyNowOnly
                            ? 'Required by the current API schema; it has no bidding meaning in Buy Now-only mode.'
                            : undefined
                    }
                />
                {showBuyNow && (
                    <AdminNumberField
                        label="Buy Now price"
                        value={form.buyNowPrice ?? 0}
                        error={validation.buyNowPrice}
                        onChange={(value) => onChange({ ...form, buyNowPrice: value })}
                    />
                )}
                <label className="admin-field">
                    <span>Start time (local display)</span>
                    <input
                        name="startTimeLocal"
                        onChange={(event) =>
                            onChange({ ...form, startTimeLocal: event.target.value })
                        }
                        type="datetime-local"
                        value={form.startTimeLocal}
                    />
                </label>
                <label className="admin-field">
                    <span>End time (local display)</span>
                    <input
                        name="endTimeLocal"
                        onChange={(event) =>
                            onChange({ ...form, endTimeLocal: event.target.value })
                        }
                        type="datetime-local"
                        value={form.endTimeLocal}
                    />
                    {validation.endTimeLocal && (
                        <small className="admin-validation">{validation.endTimeLocal}</small>
                    )}
                </label>
                <div className="admin-form-actions">
                    <button className="admin-secondary-button" onClick={onCancel} type="button">
                        Cancel
                    </button>
                    <button className="primary-button" disabled={busy} type="submit">
                        {busy ? 'Saving...' : mode === 'create' ? 'Create auction' : 'Save changes'}
                    </button>
                </div>
            </form>
        </section>
    );
}

function AdminField({
    error,
    label,
    name,
    onChange,
    value,
}: {
    error?: string;
    label: string;
    name: string;
    onChange: (value: string) => void;
    value: string;
}) {
    return (
        <label className="admin-field">
            <span>{label}</span>
            <input name={name} onChange={(event) => onChange(event.target.value)} value={value} />
            {error && <small className="admin-validation">{error}</small>}
        </label>
    );
}

function AdminNumberField({
    error,
    help,
    label,
    onChange,
    value,
}: {
    error?: string;
    help?: string;
    label: string;
    onChange: (value: number) => void;
    value: number;
}) {
    return (
        <label className="admin-field">
            <span>{label}</span>
            <input
                min="0"
                onChange={(event) => onChange(Number(event.target.value))}
                step="0.01"
                type="number"
                value={value}
            />
            {help && <small>{help}</small>}
            {error && <small className="admin-validation">{error}</small>}
        </label>
    );
}
