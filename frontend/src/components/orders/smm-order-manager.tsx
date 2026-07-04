"use client";

import { useMemo, useState, useEffect } from "react";
import { useT } from "@/lib/i18n";
import { useAuthStore } from "@/store/auth-store";
import { useTelegramServices, usePlaceOrder, usePlaceMassOrder, SMMService } from "@/hooks/use-orders";
import { useToast } from "@/components/ui/toast";
import {
  ShoppingCart,
  Plus,
  Minus,
  Search,
  AlertCircle,
  Loader2,
  Trash2,
  ListOrdered,
  FileText,
  Wallet,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Tab = "services" | "new" | "mass";

interface SmmOrderManagerProps {
  title: string;
  description: string;
  allowedServiceIds: number[];
}

export function SmmOrderManager({ title, description, allowedServiceIds }: SmmOrderManagerProps) {
  const _ = useT();
  const user = useAuthStore((s) => s.user);
  const [tab, setTab] = useState<Tab>("services");
  const { data: services, isLoading, error } = useTelegramServices();

  const [selectedServiceId, setSelectedServiceId] = useState<number | "">("");

  const filteredServices = useMemo(() => {
    return services?.filter((s) => allowedServiceIds.includes(Number(s.id))) ?? [];
  }, [services, allowedServiceIds]);

  const tabs = [
    { id: "services" as Tab, label: _("orders.services") || "Services", icon: ListOrdered },
    { id: "new" as Tab, label: _("orders.newOrder") || "New Order", icon: Plus },
    { id: "mass" as Tab, label: _("orders.massOrder") || "Mass Order", icon: FileText },
  ];

  const handleOrderSelect = (serviceId: number) => {
    setSelectedServiceId(serviceId);
    setTab("new");
  };

  return (
    <div className="space-y-6">
      {/* Header + Balance */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">{title}</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">{description}</p>
        </div>
        {user && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 dark:bg-slate-900/60 border border-slate-200/85 dark:border-slate-800 rounded-xl self-start sm:self-auto">
            <Wallet className="h-4 w-4 text-slate-500 dark:text-slate-400" />
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300 whitespace-nowrap">
              {_("orders.yourBalance")}: <span className="text-sm font-bold text-slate-900 dark:text-slate-100 ml-1">Rp {user.balance?.toLocaleString() || 0}</span>
            </span>
          </div>
        )}
      </div>

      {/* Tab Navigation (Pill container) */}
      <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
        <div className="bg-slate-100 dark:bg-slate-900/60 p-1 rounded-xl flex gap-1 w-fit border border-slate-200/60 dark:border-slate-800">
          {tabs.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all whitespace-nowrap",
                  tab === t.id
                    ? "bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm ring-1 ring-black/5 dark:ring-slate-700/50"
                    : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Views */}
      <div className="mt-4">
        {tab === "services" && (
          <ServicesListView
            services={filteredServices}
            isLoading={isLoading}
            error={error}
            onOrderSelect={handleOrderSelect}
          />
        )}
        {tab === "new" && (
          <NewOrderForm
            services={filteredServices}
            initialServiceId={selectedServiceId}
            onServiceChange={setSelectedServiceId}
          />
        )}
        {tab === "mass" && (
          <MassOrderForm
            services={filteredServices}
          />
        )}
      </div>
    </div>
  );
}

interface ServicesListViewProps {
  services: SMMService[];
  isLoading: boolean;
  error: any;
  onOrderSelect: (id: number) => void;
}

function ServicesListView({ services, isLoading, error, onOrderSelect }: ServicesListViewProps) {
  const _ = useT();
  const [search, setSearch] = useState("");
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});

  const { grouped, categories } = useMemo(() => {
    const filtered = services.filter(
      (s) =>
        !search ||
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.category.toLowerCase().includes(search.toLowerCase())
    );

    const map = new Map<string, SMMService[]>();
    for (const s of filtered) {
      const cat = s.category || "Other";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(s);
    }

    const sortedCategories = Array.from(map.keys()).sort();
    return { grouped: map, categories: sortedCategories };
  }, [services, search]);

  useEffect(() => {
    if (categories.length > 0) {
      const defaultExpanded: Record<string, boolean> = {};
      for (const cat of categories) {
        defaultExpanded[cat] = true;
      }
      setExpandedCategories(defaultExpanded);
    }
  }, [categories]);

  const toggleCategory = (cat: string) => {
    setExpandedCategories((prev) => ({ ...prev, [cat]: !prev[cat] }));
  };

  const totalInCategory = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of services) {
      m.set(s.category, (m.get(s.category) || 0) + 1);
    }
    return m;
  }, [services]);

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        {Array.from({ length: 2 }).map((_, gi) => (
          <div key={gi} className="border border-slate-100 dark:border-slate-800 rounded-xl p-4 space-y-3">
            <div className="h-5 w-40 bg-slate-100 dark:bg-slate-900 rounded" />
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-16 bg-slate-50 dark:bg-slate-900/60 rounded-xl" />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-3 p-4 bg-red-50/50 dark:bg-red-950/20 border border-red-200/50 dark:border-red-900/30 rounded-xl text-red-700 dark:text-red-400">
        <AlertCircle className="h-5 w-5 flex-shrink-0" />
        <p className="text-sm font-medium">Failed to load services</p>
      </div>
    );
  }

  if (services.length === 0) {
    return (
      <div className="text-center py-16 border border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-950/20">
        <Search className="h-10 w-10 mx-auto mb-3 text-slate-300 dark:text-slate-700" />
        <p className="font-semibold text-slate-900 dark:text-slate-100 text-sm">No services available</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search Input */}
      <div className="relative max-w-md">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={_("orders.searchService") || "Search services..."}
          className="w-full pl-10 pr-4 py-2.5 border border-slate-200 dark:border-slate-850 bg-white dark:bg-slate-950 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 dark:focus:border-blue-500 transition-all placeholder:text-slate-400 text-slate-900 dark:text-slate-100"
        />
      </div>

      <div className="space-y-5">
        {categories.map((cat) => {
          const items = grouped.get(cat) ?? [];
          const isExpanded = expandedCategories[cat] ?? true;
          const totalCount = totalInCategory.get(cat) || 0;

          return (
            <div key={cat} className="border border-slate-200/80 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-slate-950/20">
              {/* Category Header */}
              <button
                onClick={() => toggleCategory(cat)}
                className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200/80 dark:border-slate-800 text-left transition-colors hover:bg-slate-100/60 dark:hover:bg-slate-900/80"
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{cat}</span>
                  <span className="text-xs text-slate-400 bg-slate-200/60 dark:bg-slate-800 px-2 py-0.5 rounded-full font-medium">
                    {items.length}/{totalCount} {_("orders.services")}
                  </span>
                </div>
                <div className="text-slate-400">
                  {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </div>
              </button>

              {isExpanded && (
                <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {items.map((service) => (
                    <div key={service.id} className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-50/50 dark:hover:bg-slate-900/10 transition-colors">
                      <div className="space-y-1 flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-mono text-slate-400 dark:text-slate-500 bg-slate-150/60 dark:bg-slate-900 px-1.5 py-0.5 rounded">
                            ID: {service.id}
                          </span>
                          <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 leading-snug">
                            {service.name}
                          </h4>
                        </div>
                        {service.note && (
                          <p className="text-xs text-slate-400 dark:text-slate-450 italic line-clamp-2 max-w-3xl leading-relaxed">
                            {service.note}
                          </p>
                        )}
                        <div className="flex items-center gap-4 text-xs text-slate-500 pt-1 flex-wrap">
                          {service.speed && (
                            <span className="flex items-center gap-1">
                              <span className="font-semibold text-slate-400">{_("orders.speed") || "Speed"}:</span>
                              <span className="text-slate-600 dark:text-slate-350">{service.speed}</span>
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <span className="font-semibold text-slate-400">{_("orders.min") || "Min"}:</span>
                            <span className="text-slate-600 dark:text-slate-350">{service.min.toLocaleString()}</span>
                          </span>
                          <span className="flex items-center gap-1">
                            <span className="font-semibold text-slate-400">{_("orders.max") || "Max"}:</span>
                            <span className="text-slate-600 dark:text-slate-350">{service.max.toLocaleString()}</span>
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between md:justify-end gap-6 border-t md:border-t-0 pt-3 md:pt-0 border-slate-100 dark:border-slate-800">
                        <div className="text-right">
                          <span className="text-xs text-slate-400 block">{_("orders.price") || "Price"}</span>
                          <span className="text-base font-bold text-blue-650 dark:text-blue-400">
                            Rp {service.price.toLocaleString()}
                            <span className="text-xs font-normal text-slate-400">/1k</span>
                          </span>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => onOrderSelect(service.id)}
                          className="bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white rounded-xl text-xs h-9 px-4 shrink-0 transition-colors shadow-sm"
                        >
                          <ShoppingCart className="h-3.5 w-3.5 mr-1.5" /> {_("orders.placeOrder")}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface NewOrderFormProps {
  services: SMMService[];
  initialServiceId: number | "";
  onServiceChange: (id: number | "") => void;
}

function NewOrderForm({ services, initialServiceId, onServiceChange }: NewOrderFormProps) {
  const _ = useT();
  const { toast } = useToast();
  const user = useAuthStore((s) => s.user);
  const placeOrder = usePlaceOrder();

  const [dataTarget, setDataTarget] = useState("");
  const [quantity, setQuantity] = useState(100);
  const [comments, setComments] = useState("");

  const selectedService = services.find((s) => Number(s.id) === Number(initialServiceId));

  useEffect(() => {
    if (selectedService) {
      setQuantity(selectedService.min);
    }
  }, [initialServiceId]);

  const estimatedPrice = selectedService
    ? Math.max(1, (selectedService.price * quantity) / 1000)
    : 0;

  const hasSufficientBalance = user ? user.balance >= estimatedPrice : false;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!initialServiceId || !dataTarget) return;

    try {
      await placeOrder.mutateAsync({
        service_id: Number(initialServiceId),
        data_target: dataTarget,
        quantity,
        comments: comments || undefined,
      });
      toast({
        variant: "success",
        title: _("orders.orderPlaced") || "Order placed successfully!",
      });
      setDataTarget("");
      setComments("");
    } catch (err: any) {
      toast({
        variant: "error",
        title: _("orders.orderFailed") || "Order failed",
        description: err?.response?.data?.detail || "An error occurred",
      });
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <Card className="border border-slate-200/80 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-950">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg font-bold text-slate-900 dark:text-slate-100">{_("orders.newOrder") || "New Order"}</CardTitle>
          <CardDescription className="text-slate-400 text-xs mt-0.5">{_("orders.desc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">{_("orders.services")}</label>
              <select
                value={initialServiceId}
                onChange={(e) => onServiceChange(e.target.value ? Number(e.target.value) : "")}
                className="w-full border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 dark:focus:border-blue-500 transition-all text-slate-900 dark:text-slate-100"
                required
              >
                <option value="">{_("orders.selectService")}</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    [{s.id}] {s.name} - Rp {s.price.toLocaleString()}/1k
                  </option>
                ))}
              </select>
            </div>

            {selectedService && (
              <div className="p-3.5 bg-slate-50 dark:bg-slate-900/40 border border-slate-200/60 dark:border-slate-800 rounded-xl text-xs text-slate-600 dark:text-slate-300 space-y-1">
                <p className="font-semibold text-slate-900 dark:text-slate-100">{selectedService.name}</p>
                {selectedService.note && <p className="text-slate-400 italic leading-relaxed mt-1">{selectedService.note}</p>}
                <div className="flex gap-4 text-slate-400 pt-1.5">
                  <span>Min: <span className="font-semibold text-slate-700 dark:text-slate-250">{selectedService.min.toLocaleString()}</span></span>
                  <span>Max: <span className="font-semibold text-slate-700 dark:text-slate-250">{selectedService.max.toLocaleString()}</span></span>
                  {selectedService.speed && <span>Speed: <span className="font-semibold text-slate-700 dark:text-slate-250">{selectedService.speed}</span></span>}
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">{_("orders.dataTarget")}</label>
              <input
                type="text"
                value={dataTarget}
                onChange={(e) => setDataTarget(e.target.value)}
                placeholder={_("orders.dataTargetPlaceholder") || "Enter target URL or username..."}
                className="w-full border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-955 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 dark:focus:border-blue-500 transition-all text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">{_("orders.quantity")}</label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setQuantity(Math.max(selectedService?.min || 1, quantity - 100))}
                  className="p-2.5 border border-slate-200 dark:border-slate-850 bg-slate-50 dark:bg-slate-900 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800/80 transition-colors flex-shrink-0"
                >
                  <Minus className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                </button>
                <input
                  type="number"
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                  min={selectedService?.min || 1}
                  max={selectedService?.max || 999999}
                  className="w-full text-center border border-slate-200 dark:border-slate-850 bg-white dark:bg-slate-950 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 dark:focus:border-blue-500 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setQuantity(Math.min(selectedService?.max || 999999, quantity + 100))}
                  className="p-2.5 border border-slate-200 dark:border-slate-855 bg-slate-50 dark:bg-slate-900 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800/80 transition-colors flex-shrink-0"
                >
                  <Plus className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                </button>
              </div>
            </div>

            {selectedService && (
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">Comments <span className="text-slate-400 font-normal">(optional)</span></label>
                <textarea
                  value={comments}
                  onChange={(e) => setComments(e.target.value)}
                  rows={3}
                  placeholder="One comment per line for comment services..."
                  className="w-full border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 dark:focus:border-blue-500 transition-all text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
                />
              </div>
            )}

            {/* Order Summary Panel */}
            <div className="p-4 bg-slate-50 dark:bg-slate-900/30 border border-slate-200/80 dark:border-slate-850 rounded-xl space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">Order Summary</h4>
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">{_("orders.price")}:</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {selectedService ? `Rp ${selectedService.price.toLocaleString()}/1k` : "-"}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">{_("orders.quantity")}:</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">{quantity.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm font-bold border-t border-slate-200/60 dark:border-slate-800/80 pt-2.5">
                <span className="text-slate-900 dark:text-slate-100">{_("orders.totalPrice")}:</span>
                <span className="text-blue-600 dark:text-blue-400">Rp {estimatedPrice.toLocaleString()}</span>
              </div>
            </div>

            {/* Balance Alert Banner */}
            {user && (
              <div className={cn(
                "p-3 rounded-xl border text-xs font-semibold flex items-center gap-2.5",
                hasSufficientBalance
                  ? "bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-250/30 dark:border-emerald-800/40 text-emerald-700 dark:text-emerald-400"
                  : "bg-red-50/50 dark:bg-red-950/20 border-red-250/30 dark:border-red-800/40 text-red-700 dark:text-red-400"
              )}>
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <div>
                  {hasSufficientBalance ? (
                    <span>Balance sufficient. Rp {(user.balance - estimatedPrice).toLocaleString()} will remain.</span>
                  ) : (
                    <span>Insufficient balance. Required: Rp {estimatedPrice.toLocaleString()} (Your balance: Rp {user.balance.toLocaleString()}).</span>
                  )}
                </div>
              </div>
            )}

            <Button
              type="submit"
              disabled={placeOrder.isPending || !initialServiceId || !dataTarget || !hasSufficientBalance}
              className="w-full h-11 bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white rounded-xl font-semibold shadow-sm transition-colors border-0"
            >
              {placeOrder.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> {_("orders.placingOrder")}</>
              ) : (
                <><ShoppingCart className="h-4 w-4 mr-2" /> {_("orders.placeOrder")}</>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

interface MassOrderFormProps {
  services: SMMService[];
}

function MassOrderForm({ services }: MassOrderFormProps) {
  const _ = useT();
  const { toast } = useToast();
  const user = useAuthStore((s) => s.user);
  const placeMassOrder = usePlaceMassOrder();

  const [items, setItems] = useState<Array<{ service_id: number | ""; data_target: string; quantity: number }>>([
    { service_id: "", data_target: "", quantity: 100 },
  ]);

  const addItem = () => {
    setItems([...items, { service_id: "", data_target: "", quantity: 100 }]);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: string, value: any) => {
    const updated = [...items];
    (updated[index] as any)[field] = value;
    setItems(updated);
  };

  const totalCost = items.reduce((sum, item) => {
    const svc = services.find((s) => Number(s.id) === Number(item.service_id));
    if (!svc || !item.service_id) return sum;
    return sum + Math.max(1, (svc.price * item.quantity) / 1000);
  }, 0);

  const hasSufficientBalance = user ? user.balance >= totalCost : false;

  const handleSubmit = async (e: React.FormEvent) => {
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
      toast({
        variant: "success",
        title: _("orders.orderPlaced") || "Orders placed successfully!",
        description: `Successfully placed ${validItems.length} orders.`,
      });
      setItems([{ service_id: "", data_target: "", quantity: 100 }]);
    } catch (err: any) {
      toast({
        variant: "error",
        title: _("orders.orderFailed") || "Orders failed",
        description: err?.response?.data?.detail || "An error occurred",
      });
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <Card className="border border-slate-200/80 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-950">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg font-bold text-slate-900 dark:text-slate-100">{_("orders.massOrder") || "Mass Order"}</CardTitle>
          <CardDescription className="text-slate-400 text-xs mt-0.5">{_("orders.massOrderDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-3">
              {items.map((item, index) => (
                <div key={index} className="p-4 border border-slate-200 dark:border-slate-800/80 rounded-xl space-y-3 relative bg-slate-50/30 dark:bg-slate-900/10">
                  {items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeItem(index)}
                      className="absolute top-3 right-3 p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50/50 dark:hover:bg-red-950/20 rounded-lg transition-colors z-10"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}

                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                      {_("orders.services")} #{index + 1}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold text-slate-500 dark:text-slate-450 mb-1">{_("orders.services")}</label>
                      <select
                        value={item.service_id}
                        onChange={(e) => updateItem(index, "service_id", e.target.value ? Number(e.target.value) : "")}
                        className="w-full border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-900 dark:text-slate-100"
                        required
                      >
                        <option value="">{_("orders.selectService")}</option>
                        {services.map((s) => (
                          <option key={s.id} value={s.id}>
                            [{s.id}] {s.name} - Rp {s.price.toLocaleString()}/1k
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 dark:text-slate-450 mb-1">{_("orders.quantity")}</label>
                      <input
                        type="number"
                        value={item.quantity}
                        onChange={(e) => updateItem(index, "quantity", Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-full border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-900 dark:text-slate-100"
                        required
                        min={1}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-450 mb-1">{_("orders.dataTarget")}</label>
                    <input
                      type="text"
                      value={item.data_target}
                      onChange={(e) => updateItem(index, "data_target", e.target.value)}
                      placeholder={_("orders.dataTargetPlaceholder") || "Enter target URL or username..."}
                      className="w-full border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
                      required
                    />
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={addItem}
              className="flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-blue-600 dark:text-blue-400 hover:bg-slate-50 dark:hover:bg-slate-900/60 rounded-xl transition-all w-full justify-center border border-dashed border-slate-200 dark:border-slate-800 hover:border-slate-300"
            >
              <Plus className="h-4 w-4" /> {_("orders.addMore")}
            </button>

            <div className="p-4 bg-slate-50 dark:bg-slate-900/30 border border-slate-200/80 dark:border-slate-800 rounded-xl space-y-2">
              <div className="flex justify-between text-sm font-bold">
                <span className="text-slate-900 dark:text-slate-100">{_("orders.totalAll")}:</span>
                <span className="text-blue-600 dark:text-blue-400">Rp {totalCost.toLocaleString()}</span>
              </div>
            </div>

            {/* Balance Alert Banner */}
            {user && (
              <div className={cn(
                "p-3 rounded-xl border text-xs font-semibold flex items-center gap-2.5",
                hasSufficientBalance
                  ? "bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-250/30 dark:border-emerald-800/40 text-emerald-700 dark:text-emerald-400"
                  : "bg-red-50/50 dark:bg-red-950/20 border-red-250/30 dark:border-red-800/40 text-red-700 dark:text-red-400"
              )}>
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <div>
                  {hasSufficientBalance ? (
                    <span>Balance sufficient. Rp {(user.balance - totalCost).toLocaleString()} will remain.</span>
                  ) : (
                    <span>Insufficient balance. Required: Rp {totalCost.toLocaleString()} (Your balance: Rp {user.balance.toLocaleString()}).</span>
                  )}
                </div>
              </div>
            )}

            <Button
              type="submit"
              disabled={placeMassOrder.isPending || items.every((i) => !i.service_id || !i.data_target) || !hasSufficientBalance}
              className="w-full h-11 bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white rounded-xl font-semibold shadow-sm border-0 transition-colors"
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
