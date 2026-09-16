import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/auth.service';
import { DiagramsService } from './diagrams.service';
import { SaveDiagramDto } from './dto/save-diagram.dto';

/**
 * @UseGuards(JwtAuthGuard) exige cuenta; la autorización fina (dueño /
 * EDITOR / VIEWER del proyecto) vive en DiagramsService, que la resuelve
 * siempre a través de ProjectsService (ver ProjectMember).
 */
@Controller('diagrams')
@UseGuards(JwtAuthGuard)
export class DiagramsController {
  constructor(private readonly diagramsService: DiagramsService) {}

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.diagramsService.getById(id, user.sub);
  }

  @Put(':id')
  save(@Param('id') id: string, @Body() dto: SaveDiagramDto, @CurrentUser() user: JwtPayload) {
    return this.diagramsService.save(id, user.sub, dto.model);
  }
}
