import { useQuery } from "@tanstack/react-query";
import { useTranslate } from "@tolgee/react";
import { templates as templatesData } from "@typebot.io/templates";
import { Badge } from "@typebot.io/ui/components/Badge";
import { Button } from "@typebot.io/ui/components/Button";
import { Dialog } from "@typebot.io/ui/components/Dialog";
import { useState } from "react";
import { IsolatedPreview } from "@/features/preview/components/IsolatedPreview";
import { orpc } from "@/lib/queryClient";
import type { HostTemplateMetadata } from "../api/hostTemplateApi";
import type { TemplateProps } from "../types";

type SelectedTemplate =
  | { kind: "builtin"; template: TemplateProps }
  | { kind: "host"; template: HostTemplateMetadata };

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onTemplateChoose: (
    args:
      | { kind: "builtin"; templateSlug: string; fromTemplate: string }
      | { kind: "host"; hostTemplateKey: string; fromTemplate: string },
  ) => void;
  isLoading: boolean;
};

export const TemplatesDialog = ({
  isOpen,
  onClose,
  onTemplateChoose,
  isLoading,
}: Props) => {
  const { t } = useTranslate();
  const templates = templatesData;
  const [selectedTemplate, setSelectedTemplate] = useState<SelectedTemplate>({
    kind: "builtin",
    template: templates[0],
  });
  const {
    data: hostTemplateCatalog,
    isLoading: isHostCatalogLoading,
    isError: isHostCatalogError,
    refetch: retryHostCatalog,
  } = useQuery({
    ...orpc.typebot.listHostTemplates.queryOptions({ input: {} }),
    enabled: isOpen,
  });

  const onUseThisTemplateClick = async () => {
    if (selectedTemplate.kind === "host")
      onTemplateChoose({
        kind: "host",
        hostTemplateKey: selectedTemplate.template.key,
        fromTemplate: selectedTemplate.template.name,
      });
    else
      onTemplateChoose({
        kind: "builtin",
        templateSlug: selectedTemplate.template.slug,
        fromTemplate: selectedTemplate.template.name,
      });
  };

  const isSelectedBuiltin = (template: TemplateProps) =>
    selectedTemplate.kind === "builtin" &&
    selectedTemplate.template.slug === template.slug;

  return (
    <Dialog.Root isOpen={isOpen} onClose={onClose}>
      <Dialog.Popup className="p-0 flex flex-row max-w-6xl max-h-full gap-0">
        <div className="flex flex-col gap-2 w-[300px] py-4 px-2 border-r justify-between overflow-y-auto shrink-0">
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium pl-1" color="gray.500">
                {t("templates.modal.menuHeading.marketing")}
              </p>
              {templates
                .filter((template) => template.category === "marketing")
                .map((template) => (
                  <Button
                    size="sm"
                    key={template.name}
                    onClick={() =>
                      setSelectedTemplate({ kind: "builtin", template })
                    }
                    className="w-full"
                    variant={isSelectedBuiltin(template) ? "outline" : "ghost"}
                    disabled={template.isComingSoon}
                  >
                    <div className="flex items-center gap-2 overflow-hidden text-sm w-full">
                      <p>{template.emoji}</p>
                      <p>{template.name}</p>
                      {template.isNew && (
                        <Badge colorScheme="orange" className="shrink-0">
                          {t("templates.modal.menuHeading.new.tag")}
                        </Badge>
                      )}
                    </div>
                  </Button>
                ))}
            </div>
            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium pl-1" color="gray.500">
                {t("templates.modal.menuHeading.product")}
              </p>
              {templates
                .filter((template) => template.category === "product")
                .map((template) => (
                  <Button
                    size="sm"
                    key={template.name}
                    onClick={() =>
                      setSelectedTemplate({ kind: "builtin", template })
                    }
                    className="w-full"
                    variant={isSelectedBuiltin(template) ? "outline" : "ghost"}
                    disabled={template.isComingSoon}
                  >
                    <div className="flex items-center gap-2 overflow-hidden text-sm w-full">
                      <p>{template.emoji}</p>
                      <p>{template.name}</p>
                      {template.isNew && (
                        <Badge colorScheme="orange" className="shrink-0">
                          {t("templates.modal.menuHeading.new.tag")}
                        </Badge>
                      )}
                    </div>
                  </Button>
                ))}
            </div>
            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium pl-1" color="gray.500">
                {t("templates.modal.menuHeading.other")}
              </p>
              {templates
                .filter((template) => template.category === undefined)
                .map((template) => (
                  <Button
                    size="sm"
                    key={template.name}
                    onClick={() =>
                      setSelectedTemplate({ kind: "builtin", template })
                    }
                    className="w-full"
                    variant={isSelectedBuiltin(template) ? "outline" : "ghost"}
                    disabled={template.isComingSoon}
                  >
                    <div className="flex items-center gap-2 overflow-hidden text-sm w-full">
                      <p>{template.emoji}</p>
                      <p>{template.name}</p>
                      {template.isNew && (
                        <Badge colorScheme="orange" className="shrink-0">
                          {t("templates.modal.menuHeading.new.tag")}
                        </Badge>
                      )}
                    </div>
                  </Button>
                ))}
            </div>
            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium pl-1" color="gray.500">
                Host templates
              </p>
              {hostTemplateCatalog?.templates.map((template) => (
                <Button
                  size="sm"
                  key={template.key}
                  onClick={() =>
                    setSelectedTemplate({ kind: "host", template })
                  }
                  className="w-full"
                  variant={
                    selectedTemplate.kind === "host" &&
                    selectedTemplate.template.key === template.key
                      ? "outline"
                      : "ghost"
                  }
                >
                  <div className="flex items-center gap-2 overflow-hidden text-sm w-full">
                    <p>🤖</p>
                    <p className="truncate">{template.name}</p>
                    <Badge colorScheme="blue" className="shrink-0">
                      Host
                    </Badge>
                  </div>
                </Button>
              ))}
              {isHostCatalogLoading && (
                <p className="px-1 text-xs text-gray-10">
                  Loading Host templates…
                </p>
              )}
              {isHostCatalogError && (
                <div className="flex items-center justify-between gap-2 px-1">
                  <p className="text-xs text-gray-10">
                    Host templates unavailable
                  </p>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void retryHostCatalog()}
                  >
                    Retry
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
        <div
          style={{
            backgroundColor:
              selectedTemplate.kind === "builtin"
                ? (selectedTemplate.template.backgroundColor ?? "white")
                : "white",
          }}
          className="flex flex-col w-full gap-4 items-center pb-4"
        >
          {selectedTemplate.kind === "builtin" ? (
            <IsolatedPreview
              key={selectedTemplate.template.slug}
              templateSlug={selectedTemplate.template.slug}
              style={{
                borderRadius: "0.25rem",
                backgroundColor: "#fff",
              }}
            />
          ) : (
            <div className="flex min-h-[360px] w-full flex-col items-center justify-center gap-3 rounded bg-white p-8 text-center">
              <span className="text-5xl">🤖</span>
              <Badge colorScheme="blue">Host template</Badge>
              <p className="max-w-md text-sm text-gray-10">
                This template is provided by the connected Host and is validated
                when you create a new Typebot.
              </p>
            </div>
          )}
          <div className="flex items-center p-6 border rounded-md w-[95%] gap-4 bg-gray-1">
            <div className="flex flex-col flex-1 gap-4">
              <h2 className="text-2xl">
                {selectedTemplate.kind === "builtin"
                  ? `${selectedTemplate.template.emoji} `
                  : "🤖 "}
                <span className="ml-2">{selectedTemplate.template.name}</span>
              </h2>
              <p>
                {selectedTemplate.kind === "builtin"
                  ? selectedTemplate.template.summary
                  : selectedTemplate.template.description}
              </p>
            </div>
            <Button onClick={onUseThisTemplateClick} disabled={isLoading}>
              {t("templates.modal.useTemplateButton.label")}
            </Button>
          </div>
        </div>
      </Dialog.Popup>
    </Dialog.Root>
  );
};
