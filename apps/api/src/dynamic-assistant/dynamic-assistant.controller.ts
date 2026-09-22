import { Body, Controller, Post } from '@nestjs/common';
import { IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import type { DomainManifest } from '@sharegrams/uml-core';
import { DynamicAssistantService } from './dynamic-assistant.service';
import type { DynamicAICommandResult, KnownRecords } from './dynamic-assistant.types';

class InterpretDynamicCommandDto {
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  instruction!: string;

  /**
   * No se valida en profundidad (regla: mantener esto simple): el Manifest
   * nunca se ejecuta ni se persiste acá, solo se lee para armar el prompt
   * y los tools dinámicos -- un manifest malformado en el peor caso
   * produce un tool_use raro, nunca un problema de seguridad, ya que el
   * DynamicCommand resultante igual tiene que pasar por el
   * CommandValidator real del lado de la app móvil antes de ejecutarse.
   */
  @IsObject()
  manifest!: DomainManifest;

  /**
   * Opcional: registros ya existentes (id + displayField) que la app móvil
   * consultó ella misma contra el backend generado, para que Claude pueda
   * resolver un nombre a un id sin tener que preguntarlo. Mismo criterio
   * que "manifest": no se valida en profundidad, nunca se ejecuta.
   */
  @IsObject()
  @IsOptional()
  knownRecords?: KnownRecords;
}

/**
 * Deliberadamente SIN JwtAuthGuard (documentado en el informe de Fase 15):
 * la app móvil no tiene ningún login contra ShareGrams -- solo se conecta
 * a la URL de un backend generado, sin cuenta de usuario de por medio.
 * Exigir auth acá implicaría inventar un flujo de login mobile completo,
 * fuera del alcance pedido para esta fase.
 */
@Controller('dynamic-assistant')
export class DynamicAssistantController {
  constructor(private readonly service: DynamicAssistantService) {}

  @Post('interpret')
  async interpret(@Body() dto: InterpretDynamicCommandDto): Promise<DynamicAICommandResult> {
    return this.service.interpret(dto.instruction, dto.manifest, dto.knownRecords);
  }
}
