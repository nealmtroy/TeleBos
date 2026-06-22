"use client";

import { useMemo, useState } from "react";
import { useT } from "@/lib/i18n";
import { useAuthStore } from "@/store/auth-store";
import { useTelegramServices, usePlaceOrder, usePlaceMassOrder, useOrderHistory, useRefreshAllOrders, useRefreshOrderStatus, SMMService } from "@/hooks/use-orders";
import {
  ShoppingCart,
  Plus,
  Minus,
  RefreshCw,
  Search,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Trash2,
  ListOrdered,
  FileText,
  Wallet,
  Grid3X3,
  ChevronDown,
  ChevronRight,
  DollarSign,
  Check,
  Mail,
  Shield,
  Globe,
  Sparkles,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useMarketplaceStock,
  useMarketplaceStockAccounts,
  useSellEligibleAccounts,
  useSellAccounts,
  useBuyAccount,
  useMarketplacePricing,
} from "@/hooks/use-marketplace";

type Tab = "services" | "new" | "mass" | "history" | "buy_accounts" | "sell_accounts";


const STATUS_COLORS: Record<string, string> = {
  Pending: "bg-yellow-100 text-yellow-800 border-yellow-200",
  Processing: "bg-blue-100 text-blue-800 border-blue-200",
  "In progress": "bg-indigo-100 text-indigo-800 border-indigo-200",
  Partial: "bg-orange-100 text-orange-800 border-orange-200",
  Success: "bg-green-100 text-green-800 border-green-200",
  Error: "bg-red-100 text-red-800 border-red-200",
  Failed: "bg-red-100 text-red-800 border-red-200",
};

/** Pick a pastel hue for a category badge based on its name */
function categoryColor(name: string): string {
  const colors = [
    "bg-blue-50 text-blue-700 border-blue-200",
    "bg-purple-50 text-purple-700 border-purple-200",
    "bg-pink-50 text-pink-700 border-pink-200",
    "bg-orange-50 text-orange-700 border-orange-200",
    "bg-teal-50 text-teal-700 border-teal-200",
    "bg-indigo-50 text-indigo-700 border-indigo-200",
    "bg-rose-50 text-rose-700 border-rose-200",
    "bg-cyan-50 text-cyan-700 border-cyan-200",
    "bg-emerald-50 text-emerald-700 border-emerald-200",
    "bg-amber-50 text-amber-700 border-amber-200",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  return colors[Math.abs(hash) % colors.length];
}

export default function OrdersPage() {
  const _ = useT();
  const user = useAuthStore((s) => s.user);
  const [tab, setTab] = useState<Tab>("services");

  const tabs = [
    { id: "services" as Tab, label: _("orders.services"), icon: ListOrdered },
    { id: "new" as Tab, label: _("orders.newOrder"), icon: Plus },
    { id: "mass" as Tab, label: _("orders.massOrder"), icon: FileText },
    { id: "history" as Tab, label: _("orders.history"), icon: RefreshCw },
    { id: "buy_accounts" as Tab, label: _("orders.buyAccounts"), icon: ShoppingCart },
    { id: "sell_accounts" as Tab, label: _("orders.sellAccounts"), icon: DollarSign },
  ];

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header + Balance */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{_("orders.title")}</h1>
          <p className="text-gray-500 mt-0.5 sm:mt-1 text-sm sm:text-base">{_("orders.desc")}</p>
        </div>
        {user && (
          <div className="flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-xl self-start sm:self-auto w-full sm:w-auto justify-center sm:justify-start">
            <Wallet className="h-4 w-4 text-emerald-600" />
            <span className="text-sm font-semibold text-emerald-700 whitespace-nowrap">
              {_("orders.yourBalance")}: <span className="text-base sm:text-lg">{user.balance?.toLocaleString() || 0}</span>
            </span>
          </div>
        )}
      </div>

      {/* Tab Navigation — horizontally scrollable on mobile */}
      <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
        <div className="flex gap-2 border-b border-gray-200 pb-2 min-w-max sm:min-w-0">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap",
                tab === t.id
                  ? "bg-primary-50 text-primary-700 border border-primary-200"
                  : "text-gray-500 hover:text-gray-700 hover:bg-gray-50 border border-transparent"
              )}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "services" && <ServicesTab />}
      {tab === "new" && <NewOrderTab />}
      {tab === "mass" && <MassOrderTab />}
      {tab === "history" && <HistoryTab />}
      {tab === "buy_accounts" && <BuyAccountsTab />}
      {tab === "sell_accounts" && <SellAccountsTab />}
    </div>
  );
}

function ServicesTab() {
  const _ = useT();
  const { data: services, isLoading, error } = useTelegramServices();
  const [search, setSearch] = useState("");
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});

  // Group services by category — and filter by search
  const { grouped, categories } = useMemo(() => {
    const filtered = services?.filter(
      (s) =>
        !search ||
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.category.toLowerCase().includes(search.toLowerCase())
    ) ?? [];

    const map = new Map<string, typeof filtered>();
    for (const s of filtered) {
      const cat = s.category || "Other";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(s);
    }

    const sortedCategories = Array.from(map.keys()).sort();
    // Auto-expand categories that match search
    if (search) {
      setExpandedCategories((prev) => {
        const autoExpand: Record<string, boolean> = {};
        for (const cat of sortedCategories) autoExpand[cat] = true;
        return { ...prev, ...autoExpand };
      });
    }

    return { grouped: map, categories: sortedCategories };
  }, [services, search]);

  function toggleCategory(cat: string) {
    setExpandedCategories((prev) => ({ ...prev, [cat]: !prev[cat] }));
  }

  // Count total services per category (unfiltered) for the badge
  const totalInCategory = useMemo(() => {
    if (!services) return new Map<string, number>();
    const m = new Map<string, number>();
    for (const s of services) {
      m.set(s.category, (m.get(s.category) || 0) + 1);
    }
    return m;
  }, [services]);

  // Quick-jump category pills
  const categoryChips = useMemo(() => {
    if (!services || search) return [];
    const cats = Array.from(new Set(services.map((s) => s.category))).sort();
    return cats;
  }, [services, search]);

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Search + Category chips row */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={_("orders.searchService")}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
          />
        </div>

        {/* Quick category chips — scrollable on mobile */}
        {categoryChips.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-4 sm:mx-0 px-4 sm:px-0 scrollbar-hide">
            {categoryChips.map((cat) => {
              const count = totalInCategory.get(cat) || 0;
              const isActive = expandedCategories[cat];
              return (
                <button
                  key={cat}
                  onClick={() => {
                    // Toggle this category, collapse all others, scroll to it
                    setExpandedCategories((prev) => {
                      const next: Record<string, boolean> = {};
                      for (const c of categories) next[c] = false;
                      next[cat] = !prev[cat];
                      return next;
                    });
                    // scroll after state settles
                    setTimeout(() => {
                      const el = document.getElementById(`cat-${CSS.escape(cat)}`);
                      el?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }, 100);
                  }}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border transition-colors",
                    isActive
                      ? "bg-primary-50 text-primary-700 border-primary-200"
                      : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100"
                  )}
                >
                  <Grid3X3 className="h-3 w-3" />
                  {cat}
                  <span className="text-gray-400 font-normal">({count})</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Loading state */}
      {isLoading ? (
        <div className="space-y-5">
          {Array.from({ length: 3 }).map((_, gi) => (
            <div key={gi}>
              <div className="h-6 w-48 bg-gray-100 rounded-lg animate-pulse mb-3" />
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-28 bg-gray-100 rounded-xl animate-pulse" />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          <p className="text-sm">Failed to load services</p>
        </div>
      ) : categories.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <Search className="h-12 w-12 mx-auto mb-3 text-gray-300" />
          <p className="font-medium">{search ? "No services match your search" : "No Telegram services available"}</p>
        </div>
      ) : (
        // Per-category sections
        <div className="space-y-5 sm:space-y-6">
          {categories.map((cat) => {
            const items = grouped.get(cat) ?? [];
            const isExpanded = expandedCategories[cat] ?? false; // default collapsed — click to expand
            const totalCount = totalInCategory.get(cat) || 0;

            return (
              <section key={cat} id={`cat-${CSS.escape(cat)}`}>
                {/* Category header — clickable to toggle */}
                <button
                  onClick={() => toggleCategory(cat)}
                  className="flex items-center gap-2 w-full text-left mb-2.5 sm:mb-3 group"
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div className={cn("px-2.5 py-1 rounded-full text-xs font-semibold border", categoryColor(cat))}>
                      {cat}
                    </div>
                    <span className="text-xs text-gray-400 font-medium">
                      {items.length}/{totalCount} layanan
                    </span>
                  </div>
                  <div className="text-gray-400 group-hover:text-gray-600 transition-colors flex-shrink-0">
                    {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </div>
                </button>

                {/* Service cards grid */}
                {isExpanded && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-3">
                    {items.map((service) => (
                      <Card key={service.id} className="hover:shadow-md transition-shadow">
                        <CardContent className="p-3 sm:p-4">
                          <h3 className="font-semibold text-sm text-gray-900 line-clamp-2 mb-2">
                            {service.name}
                          </h3>
                          <div className="space-y-1 text-xs text-gray-500">
                            <p className="flex items-center gap-2">
                              <span className="font-medium">{_("orders.price")}:</span>
                              <span className="text-primary-600 font-semibold">{service.price.toLocaleString()}/1k</span>
                            </p>
                            <p>
                              <span className="font-medium">{_("orders.min")}:</span> {service.min}
                              <span className="mx-1.5 text-gray-300">|</span>
                              <span className="font-medium">{_("orders.max")}:</span> {service.max.toLocaleString()}
                            </p>
                            {service.speed && (
                              <p><span className="font-medium">{_("orders.speed")}:</span> {service.speed}</p>
                            )}
                            {service.note && (
                              <p className="text-gray-400 italic line-clamp-2 text-[11px] leading-relaxed">{service.note}</p>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}

                {/* When collapsed, show a mini summary strip */}
                {!isExpanded && (
                  <div className="flex flex-wrap gap-1.5">
                    {items.slice(0, 5).map((s) => (
                      <span
                        key={s.id}
                        className="text-[11px] text-gray-400 bg-gray-50 px-2 py-1 rounded-md truncate max-w-[160px]"
                        title={s.name}
                      >
                        {s.name}
                      </span>
                    ))}
                    {items.length > 5 && (
                      <span className="text-[11px] text-gray-400">+{items.length - 5} more</span>
                    )}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function NewOrderTab() {
  const _ = useT();
  const user = useAuthStore((s) => s.user);
  const { data: services } = useTelegramServices();
  const placeOrder = usePlaceOrder();

  // Group services by category for a better select experience
  const servicesByCategory = useMemo(() => {
    const map = new Map<string, SMMService[]>();
    if (!services) return map;
    for (const s of services) {
      const cat = s.category || "Other";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(s);
    }
    return map;
  }, [services]);

  const [serviceId, setServiceId] = useState<number | "">("");
  const [dataTarget, setDataTarget] = useState("");
  const [quantity, setQuantity] = useState(100);
  const [comments, setComments] = useState("");

  const selectedService = services?.find((s) => s.id === serviceId);

  const estimatedPrice = selectedService
    ? Math.max(1, (selectedService.price * quantity) / 1000)
    : 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!serviceId || !dataTarget) return;

    try {
      await placeOrder.mutateAsync({
        service_id: Number(serviceId),
        data_target: dataTarget,
        quantity,
        comments: comments || undefined,
      });
      setDataTarget("");
      setQuantity(100);
      setComments("");
    } catch (err: any) {
      // error shown via mutation
    }
  }

  return (
    <div className="max-w-full sm:max-w-2xl mx-auto">
      <Card>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-lg sm:text-xl">{_("orders.newOrder")}</CardTitle>
          <CardDescription className="text-sm">{_("orders.desc")}</CardDescription>
        </CardHeader>
        <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0">
          <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
            {/* Service Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{_("orders.services")}</label>
              <select
                value={serviceId}
                onChange={(e) => setServiceId(e.target.value ? Number(e.target.value) : "")}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                required
              >
                <option value="">{_("orders.selectService")}</option>
                {Array.from(servicesByCategory.entries()).map(([cat, svcs]) => (
                  <optgroup key={cat} label={cat}>
                    {svcs.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} - {s.price.toLocaleString()}/1k
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            {selectedService && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs sm:text-sm text-blue-700 space-y-0.5">
                <p className="font-semibold">{selectedService.name}</p>
                {selectedService.note && <p>{selectedService.note}</p>}
                <p>Min: {selectedService.min} | Max: {selectedService.max.toLocaleString()}</p>
              </div>
            )}

            {/* Data Target */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{_("orders.dataTarget")}</label>
              <input
                type="text"
                value={dataTarget}
                onChange={(e) => setDataTarget(e.target.value)}
                placeholder={_("orders.dataTargetPlaceholder")}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                required
              />
            </div>

            {/* Quantity */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{_("orders.quantity")}</label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setQuantity(Math.max(selectedService?.min || 1, quantity - 100))}
                  className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50 flex-shrink-0"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <input
                  type="number"
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                  min={selectedService?.min || 1}
                  max={selectedService?.max || 999999}
                  className="w-full text-center border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                />
                <button
                  type="button"
                  onClick={() => setQuantity(Math.min(selectedService?.max || 999999, quantity + 100))}
                  className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50 flex-shrink-0"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              {selectedService && (
                <p className="text-xs text-gray-400 mt-1">Min: {selectedService.min} - Max: {selectedService.max.toLocaleString()}</p>
              )}
            </div>

            {/* Comments for comment services */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Comments <span className="text-gray-400 font-normal">(optional)</span></label>
              <textarea
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                rows={3}
                placeholder="One comment per line for comment services"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
              />
            </div>

            {/* Price Summary — stacked on mobile, side-by-side on desktop */}
            <div className="p-3 sm:p-4 bg-gray-50 rounded-xl space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">{_("orders.price")}:</span>
                <span className="font-medium">{selectedService ? `${selectedService.price.toLocaleString()}/1k` : "-"}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">{_("orders.quantity")}:</span>
                <span className="font-medium">{quantity.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-base font-bold border-t border-gray-200 pt-2">
                <span>{_("orders.totalPrice")}:</span>
                <span className="text-primary-600">{estimatedPrice.toLocaleString()}</span>
              </div>
              {user && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">{_("orders.yourBalance")}:</span>
                  <span className={cn("font-medium", user.balance < estimatedPrice ? "text-red-600" : "text-green-600")}>
                    {user.balance.toLocaleString()}
                  </span>
                </div>
              )}
            </div>

            {placeOrder.isError && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span>{(placeOrder.error as any)?.response?.data?.detail || _("orders.orderFailed")}</span>
              </div>
            )}

            {placeOrder.isSuccess && (
              <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700">
                <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                <span>{_("orders.orderPlaced")}</span>
              </div>
            )}

            <Button
              type="submit"
              disabled={placeOrder.isPending || !serviceId || !dataTarget || (user?.balance || 0) < estimatedPrice}
              className="w-full"
            >
              {placeOrder.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> {_("orders.placingOrder")}</>
              ) : (
                <><ShoppingCart className="h-4 w-4 mr-2" /> {_("orders.placeOrder")}</>
              )}
            </Button>

            {user && user.balance < estimatedPrice && (
              <p className="text-xs text-red-500 text-center">{_("orders.insufficientBalance")}</p>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function MassOrderTab() {
  const _ = useT();
  const user = useAuthStore((s) => s.user);
  const { data: services } = useTelegramServices();
  const placeMassOrder = usePlaceMassOrder();

  const [items, setItems] = useState<Array<{ service_id: number | ""; data_target: string; quantity: number }>>([
    { service_id: "", data_target: "", quantity: 100 },
  ]);

  function addItem() {
    setItems([...items, { service_id: "", data_target: "", quantity: 100 }]);
  }

  function removeItem(index: number) {
    setItems(items.filter((_, i) => i !== index));
  }

  function updateItem(index: number, field: string, value: any) {
    const updated = [...items];
    (updated[index] as any)[field] = value;
    setItems(updated);
  }

  const totalCost = items.reduce((sum, item) => {
    const svc = services?.find((s) => s.id === item.service_id);
    if (!svc || !item.service_id) return sum;
    return sum + Math.max(1, (svc.price * item.quantity) / 1000);
  }, 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validItems = items.filter((i) => i.service_id && i.data_target);
    if (validItems.length === 0) return;

    try {
      await placeMassOrder.mutateAsync(
        validItems.map((i) => ({
          service_id: Number(i.service_id),
          data_target: i.data_target,
          quantity: i.quantity,
        }))
      );
      setItems([{ service_id: "", data_target: "", quantity: 100 }]);
    } catch (err) {
      // error shown via mutation
    }
  }

  return (
    <div className="max-w-full sm:max-w-3xl mx-auto">
      <Card>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-lg sm:text-xl">{_("orders.massOrder")}</CardTitle>
          <CardDescription className="text-sm">{_("orders.massOrderDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0">
          <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
            {items.map((item, index) => (
              <div key={index} className="p-3 sm:p-4 border border-gray-200 rounded-xl space-y-3 relative">
                {items.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeItem(index)}
                    className="absolute top-2 right-2 p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors z-10"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}

                {/* Item header: item number + remove button area */}
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    {_("orders.services")} #{index + 1}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-gray-500 mb-1">{_("orders.services")}</label>
                    <select
                      value={item.service_id}
                      onChange={(e) => updateItem(index, "service_id", e.target.value ? Number(e.target.value) : "")}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                      required
                    >
                      <option value="">{_("orders.selectService")}</option>
                      {services?.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">{_("orders.quantity")}</label>
                    <input
                      type="number"
                      value={item.quantity}
                      onChange={(e) => updateItem(index, "quantity", Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                      required
                      min={1}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{_("orders.dataTarget")}</label>
                  <input
                    type="text"
                    value={item.data_target}
                    onChange={(e) => updateItem(index, "data_target", e.target.value)}
                    placeholder={_("orders.dataTargetPlaceholder")}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                    required
                  />
                </div>
              </div>
            ))}

            <button
              type="button"
              onClick={addItem}
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-primary-600 hover:bg-primary-50 rounded-xl transition-colors w-full justify-center border-2 border-dashed border-primary-200 hover:border-primary-300"
            >
              <Plus className="h-4 w-4" /> {_("orders.addMore")}
            </button>

            {/* Total */}
            <div className="p-3 sm:p-4 bg-gray-50 rounded-xl space-y-2">
              <div className="flex justify-between text-base font-bold">
                <span>{_("orders.totalAll")}:</span>
                <span className="text-primary-600">{totalCost.toLocaleString()}</span>
              </div>
              {user && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">{_("orders.yourBalance")}:</span>
                  <span className={cn("font-medium", user.balance < totalCost ? "text-red-600" : "text-green-600")}>
                    {user.balance.toLocaleString()}
                  </span>
                </div>
              )}
            </div>

            {placeMassOrder.isError && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span>{(placeMassOrder.error as any)?.response?.data?.detail || _("orders.orderFailed")}</span>
              </div>
            )}

            {placeMassOrder.isSuccess && (
              <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700">
                <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                <span>{_("orders.orderPlaced")} ({placeMassOrder.data?.length} orders)</span>
              </div>
            )}

            <Button
              type="submit"
              disabled={placeMassOrder.isPending || items.every((i) => !i.service_id || !i.data_target) || (user?.balance || 0) < totalCost}
              className="w-full"
            >
              {placeMassOrder.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> {_("orders.placingOrder")}</>
              ) : (
                <><ShoppingCart className="h-4 w-4 mr-2" /> {_("orders.placeOrder")} ({items.filter((i) => i.service_id && i.data_target).length})</>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function HistoryTab() {
  const _ = useT();
  const { data: orders, isLoading, error } = useOrderHistory();
  const refreshOrder = useRefreshOrderStatus();
  const refreshAll = useRefreshAllOrders();

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">
        <AlertCircle className="h-5 w-5" />
        <p className="text-sm">Failed to load orders</p>
      </div>
    );
  }

  if (!orders || orders.length === 0) {
    return (
      <div className="text-center py-16">
        <ShoppingCart className="h-16 w-16 mx-auto mb-4 text-gray-300" />
        <h3 className="font-semibold text-gray-900 mb-1">{_("orders.noOrders")}</h3>
        <p className="text-sm text-gray-500 mb-4">{_("orders.startOrdering")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={() => refreshAll.mutate()}
          disabled={refreshAll.isPending}
        >
          <RefreshCw className={cn("h-4 w-4 mr-2", refreshAll.isPending && "animate-spin")} />
          {_("orders.refreshAll")}
        </Button>
      </div>

      {/* ── Desktop table ── */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left py-3 px-4 font-medium text-gray-500">{_("orders.date")}</th>
              <th className="text-left py-3 px-4 font-medium text-gray-500">{_("orders.services")}</th>
              <th className="text-left py-3 px-4 font-medium text-gray-500">{_("orders.dataTarget")}</th>
              <th className="text-right py-3 px-4 font-medium text-gray-500">{_("orders.quantity")}</th>
              <th className="text-right py-3 px-4 font-medium text-gray-500">{_("orders.totalPrice")}</th>
              <th className="text-center py-3 px-4 font-medium text-gray-500">{_("orders.status")}</th>
              <th className="text-center py-3 px-4 font-medium text-gray-500">{_("orders.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                <td className="py-3 px-4 text-gray-600 whitespace-nowrap">
                  {formatDistanceToNow(new Date(order.created_at), { addSuffix: true })}
                </td>
                <td className="py-3 px-4 max-w-[200px]">
                  <p className="truncate font-medium text-gray-900" title={order.service_name}>
                    {order.service_name}
                  </p>
                  {order.is_mass_order && (
                    <Badge variant="outline" className="text-[10px] mt-0.5">Mass</Badge>
                  )}
                </td>
                <td className="py-3 px-4 max-w-[150px]">
                  <p className="truncate text-gray-600" title={order.data_target}>{order.data_target}</p>
                </td>
                <td className="py-3 px-4 text-right text-gray-900 font-medium">
                  {order.quantity.toLocaleString()}
                </td>
                <td className="py-3 px-4 text-right text-gray-900 font-medium">
                  {order.total_price.toLocaleString()}
                </td>
                <td className="py-3 px-4 text-center">
                  <Badge className={cn("border", STATUS_COLORS[order.status] || "bg-gray-100 text-gray-800")}>
                    {order.status}
                  </Badge>
                  {order.start_count != null && (
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      {order.start_count}/{order.remains ?? "-"}
                    </p>
                  )}
                </td>
                <td className="py-3 px-4 text-center">
                  {order.smm_order_id && (
                    <button
                      onClick={() => refreshOrder.mutate(order.id)}
                      disabled={refreshOrder.isPending}
                      className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                      title={_("orders.refreshStatus")}
                    >
                      <RefreshCw className={cn("h-4 w-4", refreshOrder.isPending && "animate-spin")} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Mobile card list ── */}
      <div className="md:hidden space-y-3">
        {orders.map((order) => (
          <div key={order.id} className="bg-white border border-gray-200 rounded-xl p-4 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-gray-900 truncate" title={order.service_name}>
                  {order.service_name}
                </p>
                {order.is_mass_order && (
                  <Badge variant="outline" className="text-[10px] mt-0.5">Mass</Badge>
                )}
              </div>
              <Badge className={cn("border flex-shrink-0", STATUS_COLORS[order.status] || "bg-gray-100 text-gray-800")}>
                {order.status}
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-500">
              <span className="font-medium text-gray-400">{_("orders.dataTarget")}:</span>
              <span className="truncate text-gray-700" title={order.data_target}>{order.data_target}</span>

              <span className="font-medium text-gray-400">{_("orders.quantity")}:</span>
              <span className="text-gray-700">{order.quantity.toLocaleString()}</span>

              <span className="font-medium text-gray-400">{_("orders.totalPrice")}:</span>
              <span className="text-gray-700 font-semibold">{order.total_price.toLocaleString()}</span>

              <span className="font-medium text-gray-400">{_("orders.date")}:</span>
              <span className="text-gray-700">{formatDistanceToNow(new Date(order.created_at), { addSuffix: true })}</span>
            </div>

            {order.start_count != null && (
              <p className="text-[11px] text-gray-400">
                Progress: {order.start_count}/{order.remains ?? "-"}
              </p>
            )}

            <div className="flex justify-end pt-1 border-t border-gray-100">
              {order.smm_order_id ? (
                <button
                  onClick={() => refreshOrder.mutate(order.id)}
                  disabled={refreshOrder.isPending}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                >
                  <RefreshCw className={cn("h-3.5 w-3.5", refreshOrder.isPending && "animate-spin")} />
                  {_("orders.refreshStatus")}
                </button>
              ) : (
                <span className="text-[11px] text-gray-400 italic">No SMM ID</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BuyAccountsTab() {
  const _ = useT();
  const user = useAuthStore((s) => s.user);
  const fetchMe = useAuthStore((s) => s.fetchMe);
  const { data: stock, isLoading: stockLoading, refetch: refetchStock } = useMarketplaceStock();
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  
  // Confirmation Modal
  const [buyConfirmOpen, setBuyConfirmOpen] = useState(false);
  const [pendingBuyAccount, setPendingBuyAccount] = useState<{
    id: string;
    telegram_id: number | null;
    price: number;
    country_code: string;
  } | null>(null);

  // Success Modal
  const [successOpen, setSuccessOpen] = useState(false);
  const [boughtAccount, setBoughtAccount] = useState<{
    id: string;
    telegram_id: number | null;
    phone: string;
    first_name: string | null;
    last_name: string | null;
    username: string | null;
  } | null>(null);

  const buyMutation = useBuyAccount();

  const handleBuyConfirm = async () => {
    if (!pendingBuyAccount) return;
    try {
      const res = await buyMutation.mutateAsync(pendingBuyAccount.id);
      setBoughtAccount(res);
      await fetchMe();
      await refetchStock();
      setBuyConfirmOpen(false);
      setPendingBuyAccount(null);
      setSuccessOpen(true);
    } catch (err) {
      console.error(err);
    }
  };

  if (stockLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-32 bg-gray-100 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (!stock || stock.length === 0) {
    return (
      <div className="text-center py-16 bg-white border border-gray-200 rounded-2xl">
        <ShoppingCart className="h-16 w-16 mx-auto mb-4 text-gray-300" />
        <h3 className="font-semibold text-gray-900 mb-1">{_("orders.noOrders") || "No Ready Stock"}</h3>
        <p className="text-sm text-gray-500">{_("orders.startOrdering") || "Check back later for newly added stock!"}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stock Category Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {stock.map((cat) => {
          const isExpanded = selectedCountry === cat.country_code;
          return (
            <Card
              key={cat.country_code}
              className={cn(
                "hover:shadow-md transition cursor-pointer border-2",
                isExpanded ? "border-primary-500 shadow-sm" : "border-gray-200"
              )}
              onClick={() => setSelectedCountry(isExpanded ? null : cat.country_code)}
            >
              <CardContent className="p-5 flex flex-col justify-between h-full space-y-4">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Globe className="h-4 w-4 text-gray-400" />
                      <span className="font-bold text-gray-900">{cat.country_name}</span>
                    </div>
                    <p className="text-sm font-mono text-gray-500 font-semibold">{cat.country_code}</p>
                  </div>
                  <Badge variant="outline" className="text-xs bg-primary-50 text-primary-700 border-primary-200 font-semibold px-2.5 py-1">
                    {cat.ready_stock} {_("orders.readyStock")}
                  </Badge>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-gray-100">
                  <span className="text-xs text-gray-400 font-medium">{_("orders.pricePerAccount")}:</span>
                  <span className="text-base font-bold text-gray-900">Rp {cat.price.toLocaleString()}</span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Expanded Country Account Details */}
      {selectedCountry && (
        <CountryAccountsList
          countryCode={selectedCountry}
          price={stock.find((c) => c.country_code === selectedCountry)?.price || 0}
          onBuyClick={(acc) => {
            setPendingBuyAccount({
              id: acc.id,
              telegram_id: acc.telegram_id,
              price: stock.find((c) => c.country_code === selectedCountry)?.price || 0,
              country_code: selectedCountry,
            });
            setBuyConfirmOpen(true);
          }}
        />
      )}

      {/* Buy Confirmation Dialog */}
      <ConfirmDialog
        open={buyConfirmOpen}
        onOpenChange={setBuyConfirmOpen}
        onConfirm={handleBuyConfirm}
        title={_("orders.confirmBuyTitle")}
        message={
          <div className="space-y-3 text-left">
            <p className="text-sm text-gray-500">
              {_("orders.confirmBuyMsg")}
            </p>
            {pendingBuyAccount && (
              <div className="bg-gray-50 p-3.5 rounded-xl border border-gray-100 space-y-2.5 text-xs text-gray-600">
                <div className="flex justify-between">
                  <span>User ID:</span>
                  <span className="font-semibold text-gray-900">{pendingBuyAccount.telegram_id || "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span>Country Prefix:</span>
                  <span className="font-semibold text-gray-900 font-mono">{pendingBuyAccount.country_code}</span>
                </div>
                <div className="flex justify-between border-t border-gray-200 pt-2 font-medium">
                  <span className="text-gray-900">Total Price:</span>
                  <span className="text-primary-600 font-bold">
                    Rp {pendingBuyAccount.price.toLocaleString()}
                  </span>
                </div>
                {user && (
                  <div className="flex justify-between text-[11px] pt-1">
                    <span>{_("orders.yourBalance")}:</span>
                    <span className={cn("font-medium", user.balance < pendingBuyAccount.price ? "text-red-600" : "text-green-600")}>
                      Rp {user.balance.toLocaleString()}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        }
        confirmText={_("orders.buyAccounts")}
        cancelText={_("navbar.cancel")}
        variant="info"
        loading={buyMutation.isPending}
      />

      {/* Purchase Success Modal */}
      {successOpen && boughtAccount && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-md p-6 animate-in fade-in zoom-in duration-200">
            <div className="flex flex-col items-center text-center">
              <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mb-4">
                <Sparkles className="h-6 w-6 text-emerald-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-1">
                {_("orders.buySuccess")}
              </h3>
              <p className="text-sm text-gray-500 mb-4">
                The account has been transferred to your custody. Here are the account details:
              </p>

              <div className="w-full bg-emerald-50/50 p-4 rounded-xl border border-emerald-100 text-left text-xs space-y-2.5 mb-6">
                <div className="flex justify-between">
                  <span className="text-gray-500">Phone Number:</span>
                  <span className="font-semibold text-gray-900 font-mono">{boughtAccount.phone}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">User ID:</span>
                  <span className="font-semibold text-gray-900 font-mono">{boughtAccount.telegram_id || "—"}</span>
                </div>
                {(boughtAccount.first_name || boughtAccount.last_name) && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Name:</span>
                    <span className="font-semibold text-gray-900">
                      {boughtAccount.first_name || ""} {boughtAccount.last_name || ""}
                    </span>
                  </div>
                )}
                {boughtAccount.username && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Username:</span>
                    <span className="font-semibold text-gray-900 font-mono font-semibold">@{boughtAccount.username}</span>
                  </div>
                )}
              </div>

              <div className="flex gap-3 w-full">
                <Button
                  onClick={() => {
                    setSuccessOpen(false);
                    setBoughtAccount(null);
                    window.location.href = "/accounts";
                  }}
                  className="w-full"
                >
                  View in My Accounts
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setSuccessOpen(false);
                    setBoughtAccount(null);
                  }}
                  className="w-full"
                >
                  Close
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CountryAccountsList({
  countryCode,
  price,
  onBuyClick,
}: {
  countryCode: string;
  price: number;
  onBuyClick: (acc: any) => void;
}) {
  const _ = useT();
  const user = useAuthStore((s) => s.user);
  const { data: accounts, isLoading, error } = useMarketplaceStockAccounts(countryCode);

  if (isLoading) {
    return (
      <div className="space-y-2 mt-4 p-4 border border-gray-150 rounded-xl bg-gray-50/50">
        <Skeleton className="h-6 w-32 animate-pulse bg-gray-200" />
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full animate-pulse bg-gray-200" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 mt-4 text-xs">
        <AlertCircle className="h-4 w-4" />
        <p>Failed to load accounts for this country.</p>
      </div>
    );
  }

  if (!accounts || accounts.length === 0) {
    return (
      <div className="text-center py-8 border border-dashed border-gray-200 rounded-xl mt-4 text-xs text-gray-500 bg-white">
        No accounts available in this country.
      </div>
    );
  }

  return (
    <Card className="mt-4 border border-gray-200">
      <CardHeader className="py-4 px-5 bg-gray-50/50 border-b border-gray-100 flex flex-row justify-between items-center">
        <div>
          <CardTitle className="text-sm font-bold text-gray-900">
            Stock Details ({countryCode})
          </CardTitle>
          <CardDescription className="text-xs">
            Hiding sensitive details. Purchase to unlock full credentials.
          </CardDescription>
        </div>
        <Badge className="text-xs bg-emerald-50 text-emerald-700 border-emerald-200 font-semibold">
          Rp {price.toLocaleString()} per account
        </Badge>
      </CardHeader>
      <CardContent className="p-0 divide-y divide-gray-150">
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 text-gray-500 font-medium">
                <th className="text-left py-2.5 px-5">Telegram User ID</th>
                <th className="text-center py-2.5 px-5">2FA Password Status</th>
                <th className="text-center py-2.5 px-5">Recovery Email</th>
                <th className="text-right py-2.5 px-5">Action</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((acc) => (
                <tr key={acc.id} className="hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-b-0">
                  <td className="py-3 px-5 font-mono text-gray-900 font-semibold">
                    {acc.telegram_id || "—"}
                  </td>
                  <td className="py-3 px-5 text-center">
                    <span className={cn(
                      "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold border",
                      acc.twofa_enabled
                        ? "bg-amber-50 text-amber-700 border-amber-200"
                        : "bg-gray-50 text-gray-500 border-gray-200"
                    )}>
                      <Shield className="h-3 w-3" />
                      {acc.twofa_enabled ? "Required" : "Not Required"}
                    </span>
                  </td>
                  <td className="py-3 px-5 text-center">
                    <span className={cn(
                      "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold border",
                      acc.recovery_email_available
                        ? "bg-blue-50 text-blue-700 border-blue-200"
                        : "bg-gray-50 text-gray-500 border-gray-200"
                    )}>
                      <Mail className="h-3 w-3" />
                      {acc.recovery_email_available ? "Available" : "Not Available"}
                    </span>
                  </td>
                  <td className="py-3 px-5 text-right">
                    <Button
                      size="sm"
                      onClick={() => onBuyClick(acc)}
                      disabled={user ? user.balance < price : false}
                      className="text-xs h-8"
                    >
                      <ShoppingCart className="h-3.5 w-3.5 mr-1" />
                      Buy Account
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="sm:hidden divide-y divide-gray-100">
          {accounts.map((acc) => (
            <div key={acc.id} className="p-4 space-y-3">
              <div className="flex justify-between items-start">
                <span className="text-xs text-gray-400 font-medium">User ID:</span>
                <span className="text-sm font-semibold text-gray-900 font-mono">{acc.telegram_id || "—"}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="space-y-1">
                  <p className="text-gray-400 font-medium">2FA Password</p>
                  <span className={cn(
                    "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold border",
                    acc.twofa_enabled ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-gray-50 text-gray-500 border-gray-200"
                  )}>
                    {acc.twofa_enabled ? "Required" : "Not Required"}
                  </span>
                </div>
                <div className="space-y-1">
                  <p className="text-gray-400 font-medium">Recovery Email</p>
                  <span className={cn(
                    "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold border",
                    acc.recovery_email_available ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-gray-50 text-gray-500 border-gray-200"
                  )}>
                    {acc.recovery_email_available ? "Available" : "Not Available"}
                  </span>
                </div>
              </div>
              <Button
                size="sm"
                onClick={() => onBuyClick(acc)}
                disabled={user ? user.balance < price : false}
                className="w-full text-xs"
              >
                <ShoppingCart className="h-3.5 w-3.5 mr-1" />
                Buy Account (Rp {price.toLocaleString()})
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function SellAccountsTab() {
  const _ = useT();
  const fetchMe = useAuthStore((s) => s.fetchMe);
  const { data: eligible, isLoading, error } = useSellEligibleAccounts();
  const { data: pricing } = useMarketplacePricing();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [sellConfirmOpen, setSellConfirmOpen] = useState(false);
  const [selling, setSelling] = useState(false);

  const sellMutation = useSellAccounts();

  const handleSelectAll = () => {
    if (!eligible) return;
    if (selectedIds.length === eligible.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(eligible.map((acc) => acc.id));
    }
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSellConfirm = async () => {
    if (selectedIds.length === 0) return;
    setSelling(true);
    try {
      await sellMutation.mutateAsync(selectedIds);
      await fetchMe();
      setSelectedIds([]);
      setSellConfirmOpen(false);
    } catch (err) {
      console.error(err);
    } finally {
      setSelling(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
        <AlertCircle className="h-5 w-5" />
        <p>Failed to load eligible accounts.</p>
      </div>
    );
  }

  if (!eligible || eligible.length === 0) {
    return (
      <div className="text-center py-16 bg-white border border-gray-200 rounded-2xl">
        <DollarSign className="h-16 w-16 mx-auto mb-4 text-gray-300" />
        <h3 className="font-semibold text-gray-900 mb-1">{_("orders.noEligibleAccounts")}</h3>
        <p className="text-sm text-gray-500">
          All your connected accounts are already sold or in custody, or you don't have any verified accounts.
        </p>
      </div>
    );
  }

  const sellPrice = pricing?.sell_price || 5500;
  const totalReceive = sellPrice * selectedIds.length;

  return (
    <div className="space-y-4">
      {/* Summary Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 bg-gray-50 rounded-xl border border-gray-200 gap-3">
        <div>
          <h4 className="font-semibold text-gray-900 text-sm sm:text-base">
            {_("orders.eligibleAccounts")}
          </h4>
          <p className="text-xs text-gray-500 mt-0.5">
            Select one or more accounts. Sold accounts immediately cease active broadcasting and auto-replies.
          </p>
        </div>
        <div className="flex items-center gap-3 self-end sm:self-auto">
          <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200 font-semibold px-2.5 py-1">
            Rp {sellPrice.toLocaleString()} / account
          </Badge>
        </div>
      </div>

      {/* Eligible Accounts Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50/50 text-gray-500 font-medium">
                <th className="py-3 px-4 text-left w-10">
                  <input
                    type="checkbox"
                    checked={selectedIds.length === eligible.length}
                    onChange={handleSelectAll}
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 h-4 w-4 cursor-pointer"
                  />
                </th>
                <th className="py-3 px-4 text-left">Telegram Account</th>
                <th className="py-3 px-4 text-left">Username</th>
                <th className="py-3 px-4 text-left">Telegram ID</th>
              </tr>
            </thead>
            <tbody>
              {eligible.map((acc) => {
                const isSelected = selectedIds.includes(acc.id);
                return (
                  <tr
                    key={acc.id}
                    className={cn(
                      "border-b border-gray-100 hover:bg-gray-50/50 transition-colors last:border-b-0 cursor-pointer",
                      isSelected && "bg-primary-50/20"
                    )}
                    onClick={() => handleToggleSelect(acc.id)}
                  >
                    <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleSelect(acc.id)}
                        className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 h-4 w-4 cursor-pointer"
                      />
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center font-bold text-primary-700 text-xs shrink-0">
                          {acc.first_name ? acc.first_name[0].toUpperCase() : "U"}
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900">
                            {acc.first_name || "Unnamed"} {acc.last_name || ""}
                          </p>
                          <p className="text-xs font-mono text-gray-500">{acc.phone}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-gray-600 font-mono text-xs">
                      {acc.username ? `@${acc.username}` : "—"}
                    </td>
                    <td className="py-3 px-4 text-gray-600 font-mono text-xs">
                      {acc.telegram_id || "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Sell Floating Action Panel */}
      {selectedIds.length > 0 && (
        <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:w-96 z-50 bg-white border border-gray-200 shadow-2xl rounded-2xl p-4 sm:p-5 flex flex-col space-y-4 animate-in slide-in-from-bottom-6 duration-200">
          <div className="space-y-2">
            <div className="flex justify-between items-center text-xs text-gray-500 font-medium">
              <span>Selected Accounts:</span>
              <span className="font-bold text-gray-900">{selectedIds.length} accounts</span>
            </div>
            <div className="flex justify-between items-center text-sm font-semibold text-gray-900 border-t border-gray-100 pt-2">
              <span>{_("orders.balanceToReceive")}:</span>
              <span className="text-emerald-600 text-lg font-bold">
                Rp {totalReceive.toLocaleString()}
              </span>
            </div>
          </div>
          <Button
            onClick={() => setSellConfirmOpen(true)}
            className="w-full bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white border-none shadow-sm font-semibold"
          >
            <DollarSign className="h-4 w-4 mr-2" />
            Sell {selectedIds.length} Account(s)
          </Button>
        </div>
      )}

      {/* Multi-Sell Confirmation Dialog */}
      <ConfirmDialog
        open={sellConfirmOpen}
        onOpenChange={setSellConfirmOpen}
        onConfirm={handleSellConfirm}
        title={_("orders.confirmSellTitle")}
        message={
          <div className="space-y-3 text-left">
            <p className="text-sm text-gray-500">
              Are you sure you want to sell these {selectedIds.length} Telegram account(s)? This will stop all active broadcasting and auto-replies immediately.
            </p>
            <div className="bg-gray-50 p-3.5 rounded-xl border border-gray-100 space-y-2.5 text-xs text-gray-600">
              <div className="flex justify-between">
                <span>Selected Accounts:</span>
                <span className="font-semibold text-gray-900">{selectedIds.length}</span>
              </div>
              <div className="flex justify-between">
                <span>Price per account:</span>
                <span className="font-semibold text-gray-900">Rp {sellPrice.toLocaleString()}</span>
              </div>
              <div className="flex justify-between border-t border-gray-200 pt-2 font-medium">
                <span className="text-gray-900">{_("orders.balanceToReceive")}:</span>
                <span className="text-emerald-600 font-bold">
                  Rp {totalReceive.toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        }
        confirmText={_("orders.sellAccount")}
        cancelText={_("navbar.cancel")}
        variant="warning"
        loading={selling}
      />
    </div>
  );
}

