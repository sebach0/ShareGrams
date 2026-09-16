import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DiagramsService } from './diagrams.service';
import { SaveDiagramDto } from './dto/save-diagram.dto';

/**
 * @UseGuards(JwtAuthGuard) es toda la autorización que hay acá a propósito:
 * un diagrama se comparte por link entre cualquier usuario con cuenta (ver
 * DiagramsService). "Mis proyectos" sigue siendo privado; un diagrama puntual, no.
 */
@Controller('diagrams')
@UseGuards(JwtAuthGuard)
export class DiagramsController {
  constructor(private readonly diagramsService: DiagramsService) {}

  @Get(':id')
  get(@Param('id') id: string) {
    return this.diagramsService.getById(id);
  }

  @Put(':id')
  save(@Param('id') id: string, @Body() dto: SaveDiagramDto) {
    return this.diagramsService.save(id, dto.model);
  }
}
