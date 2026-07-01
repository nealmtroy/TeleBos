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
  CheckCircle2,
  Loader2,
  Trash2,
  ListOrdered,
  FileText,
  Wallet,
  Grid3X3,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Tab = "services" | "new" | "mass";

interface SmmOrderManagerProps {
  title: string;
  description: string;
  allowedServiceIds: number[];
}

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
    { id: "services" as Tab, label: _("orders.services"), icon: ListOrdered },
    { id: "new" as Tab, label: _("orders.newOrder"), icon: Plus },
    { id: "mass" as Tab, label: _("orders.massOrder"), icon: FileText },
  ];

  const handleOrderSelect = (serviceId: number) => {
    setSelectedServiceId(serviceId);
    setTab("new");
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header + Balance */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{title}</h1>
          <p className="text-gray-500 mt-0.5 sm:mt-1 text-sm sm:text-base">{description}</p>
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

      {/* Tab Navigation */}
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
      <div className="space-y-5 animate-pulse">
        {Array.from({ length: 2 }).map((_, gi) => (
          <div key={gi}>
            <div className="h-6 w-48 bg-gray-100 rounded-lg mb-3" />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-32 bg-gray-100 rounded-xl" />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">
        <AlertCircle className="h-5 w-5 flex-shrink-0" />
        <p className="text-sm">Failed to load services</p>
      </div>
    );
  }

  if (services.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <Search className="h-12 w-12 mx-auto mb-3 text-gray-300" />
        <p className="font-medium">No services available</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={_("orders.searchService")}
          className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
        />
      </div>

      <div className="space-y-5 sm:space-y-6">
        {categories.map((cat) => {
          const items = grouped.get(cat) ?? [];
          const isExpanded = expandedCategories[cat] ?? true;
          const totalCount = totalInCategory.get(cat) || 0;

          return (
            <section key={cat}>
              <button
                onClick={() => toggleCategory(cat)}
                className="flex items-center gap-2 w-full text-left mb-2.5 sm:mb-3 group"
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <div className={cn("px-2.5 py-1 rounded-full text-xs font-semibold border", categoryColor(cat))}>
                    {cat}
                  </div>
                  <span className="text-xs text-gray-400 font-medium">
                    {items.length}/{totalCount} {_("orders.services")}
                  </span>
                </div>
                <div className="text-gray-400 group-hover:text-gray-600 transition-colors flex-shrink-0">
                  {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </div>
              </button>

              {isExpanded && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {items.map((service) => (
                    <Card key={service.id} className="hover:shadow-md transition-shadow flex flex-col justify-between">
                      <CardContent className="p-4 flex flex-col justify-between h-full">
                        <div className="space-y-2">
                          <h3 className="font-semibold text-sm text-gray-900 line-clamp-2 leading-snug">
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
                              <p className="text-gray-400 italic line-clamp-2 text-[11px] leading-relaxed mt-1">{service.note}</p>
                            )}
                          </div>
                        </div>

                        <Button
                          size="sm"
                          onClick={() => onOrderSelect(service.id)}
                          className="w-full mt-4 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs h-9"
                        >
                          <ShoppingCart className="h-3.5 w-3.5 mr-1.5" /> {_("orders.placeOrder")}
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </section>
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
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{_("orders.newOrder")}</CardTitle>
          <CardDescription>{_("orders.desc")}</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{_("orders.services")}</label>
              <select
                value={initialServiceId}
                onChange={(e) => onServiceChange(e.target.value ? Number(e.target.value) : "")}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                required
              >
                <option value="">{_("orders.selectService")}</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} - {s.price.toLocaleString()}/1k
                  </option>
                ))}
              </select>
            </div>

            {selectedService && (
              <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-xl text-xs sm:text-sm text-blue-700 space-y-0.5">
                <p className="font-semibold">{selectedService.name}</p>
                {selectedService.note && <p className="mt-1 text-xs text-blue-600/90">{selectedService.note}</p>}
                <p className="mt-1 font-medium">Min: {selectedService.min} | Max: {selectedService.max.toLocaleString()}</p>
              </div>
            )}

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

            <div className="p-4 bg-gray-50 border border-gray-150 rounded-xl space-y-2">
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

            <Button
              type="submit"
              disabled={placeOrder.isPending || !initialServiceId || !dataTarget || (user?.balance || 0) < estimatedPrice}
              className="w-full h-11 bg-slate-900 hover:bg-slate-800 text-white rounded-xl"
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
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{_("orders.massOrder")}</CardTitle>
          <CardDescription>{_("orders.massOrderDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <form onSubmit={handleSubmit} className="space-y-4">
            {items.map((item, index) => (
              <div key={index} className="p-4 border border-gray-200 rounded-xl space-y-3 relative bg-gray-50/50">
                {items.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeItem(index)}
                    className="absolute top-2 right-2 p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors z-10"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}

                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    {_("orders.services")} #{index + 1}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-gray-500 mb-1">{_("orders.services")}</label>
                    <select
                      value={item.service_id}
                      onChange={(e) => updateItem(index, "service_id", e.target.value ? Number(e.target.value) : "")}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                      required
                    >
                      <option value="">{_("orders.selectService")}</option>
                      {services.map((s) => (
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

            <div className="p-4 bg-gray-50 border border-gray-150 rounded-xl space-y-2">
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

            <Button
              type="submit"
              disabled={placeMassOrder.isPending || items.every((i) => !i.service_id || !i.data_target) || (user?.balance || 0) < totalCost}
              className="w-full h-11 bg-slate-900 hover:bg-slate-800 text-white rounded-xl"
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
