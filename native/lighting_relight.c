#include <string.h>

#include "lighting_shared.h"

int lighting_relight_chunk(
    const uint8_t *blocks,
    const uint8_t *passable,
    const uint8_t *emitted,
    const uint16_t *heightmap,
    uint8_t *sky_out,
    uint8_t *block_out) {
  if (blocks == NULL || passable == NULL || emitted == NULL || heightmap == NULL ||
      sky_out == NULL || block_out == NULL) {
    return 1;
  }

  memset(sky_out, 0, CHUNK_VOLUME);
  memset(block_out, 0, CHUNK_VOLUME);

  IndexQueue sky_queue;
  IndexQueue block_queue;
  if (!lighting_init_queue(&sky_queue, CHUNK_VOLUME) ||
      !lighting_init_queue(&block_queue, CHUNK_VOLUME / 8)) {
    lighting_free_queue(&sky_queue);
    lighting_free_queue(&block_queue);
    return 2;
  }

  for (int local_z = 0; local_z < CHUNK_SIZE; local_z += 1) {
    for (int local_x = 0; local_x < CHUNK_SIZE; local_x += 1) {
      const int column_index = local_x + CHUNK_SIZE * local_z;
      const int column_height = heightmap[column_index];
      const int start_y =
          column_height == 0 && blocks[lighting_local_index(local_x, 0, local_z)] == AIR_BLOCK_ID
              ? 0
              : (column_height + 1 < CHUNK_HEIGHT ? column_height + 1 : CHUNK_HEIGHT);
      for (int local_y = start_y; local_y < CHUNK_HEIGHT; local_y += 1) {
        const int index = lighting_local_index(local_x, local_y, local_z);
        if (passable[index] == 0) {
          break;
        }

        sky_out[index] = LIGHT_LEVEL_MAX;
        if (!lighting_queue_push(&sky_queue, (uint32_t)index)) {
          lighting_free_queue(&sky_queue);
          lighting_free_queue(&block_queue);
          return 2;
        }
      }
    }
  }

  if (!lighting_propagate_sky_light_within_chunk(passable, sky_out, &sky_queue)) {
    lighting_free_queue(&sky_queue);
    lighting_free_queue(&block_queue);
    return 2;
  }

  for (int index = 0; index < CHUNK_VOLUME; index += 1) {
    const uint8_t emitted_light = emitted[index];
    if (emitted_light == 0) {
      continue;
    }

    block_out[index] = emitted_light;
    if (!lighting_queue_push(&block_queue, (uint32_t)index)) {
      lighting_free_queue(&sky_queue);
      lighting_free_queue(&block_queue);
      return 2;
    }
  }

  if (!lighting_propagate_block_light_within_chunk(passable, block_out, &block_queue)) {
    lighting_free_queue(&sky_queue);
    lighting_free_queue(&block_queue);
    return 2;
  }

  lighting_free_queue(&sky_queue);
  lighting_free_queue(&block_queue);
  return 0;
}
